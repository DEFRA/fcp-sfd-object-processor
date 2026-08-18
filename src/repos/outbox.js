import { config } from '../config/index.js'
import { PENDING, PROCESSING, DELIVERY_OUTCOME, PERMANENT_FAILURE, SENT } from '../constants/outbox.js'
import { db } from '../data/db.js'
import { createLogger } from '../logging/logger.js'
import { sendAuditEvent } from '../messaging/outbound/audit/send-audit-event.js'
import { runWithCorrelationId } from '../logging/correlation-id-store.js'

const logger = createLogger()

const outboxCollection = 'mongo.collections.outbox'
const outboxMaxAttemptsConfig = 'messaging.outboxMaxAttempts'

const logTerminalFailuresIfAny = async (collectionName, fileIdsArr, maxAttemptsVal, sess, errMsg, workerId) => {
  const terminalFilter = {
    'payload.file.fileId': { $in: fileIdsArr },
    status: PERMANENT_FAILURE,
    attempts: { $gte: maxAttemptsVal }
  }

  // Only query for terminal docs when there is a possibility of any
  // reaching terminal state after the increment. Check for any entries
  // with attempts >= maxAttempts - 1; if none, skip the heavier query.
  const potentialTerminalFilter = {
    'payload.file.fileId': { $in: fileIdsArr },
    attempts: { $gte: Math.max(0, maxAttemptsVal - 1) }
  }

  const potentialCount = await db.collection(collectionName).countDocuments(potentialTerminalFilter, { session: sess })
  if (potentialCount === 0) {
    return
  }

  const terminalDocs = await db.collection(collectionName)
    .find(terminalFilter, { session: sess })
    .toArray()

  terminalDocs.forEach(doc => {
    const entryId = doc.payload?.file?.fileId || null
    const attempts = doc.attempts
    const failure = doc.error || {}
    const reason = failure.message || errMsg || 'terminal_failure'
    runWithCorrelationId(doc.payload?.messaging?.correlationId, () => logger.error({
      event: {
        type: 'outbox_terminal_failure',
        action: 'terminal_failure',
        reference: doc._id?.toString(),
        outcome: 'failure',
        reason
      },
      ...(workerId && { process: { name: workerId } }),
      error: {
        type: 'outbox_terminal_failure',
        ...(entryId && { id: entryId }),
        ...(failure.code && { code: failure.code }),
        message: reason
      }
    }, `Outbox entry reached PERMANENT_FAILURE after max attempts; entryId=${entryId}; attempt=${attempts}`))
  })

  // Promise.allSettled fires audit events concurrently and never rejects, so an
  // audit publish failure can't abort the outbox poller's remaining batches.
  await Promise.allSettled(terminalDocs.map(doc => runWithCorrelationId(
    doc.payload?.messaging?.correlationId,
    () => {
      const entryId = doc.payload?.file?.fileId || null
      const attempts = doc.attempts
      const failure = doc.error || {}
      const reason = failure.message || errMsg || 'terminal_failure'
      return sendAuditEvent({
        correlationid: doc.payload?.messaging?.correlationId,
        audit: {
          entities: [{ entity: 'document', action: 'failed', entityid: entryId ?? doc._id?.toString() ?? '' }],
          status: 'failure',
          details: { reason, ...(failure.code && { code: failure.code }), attempts }
        }
      })
    }
  )))
}

const createOutboxEntries = async (ids, documents, session) => {
  const collection = config.get(outboxCollection)

  const outboxDocsToInsert = Object.entries(ids)
    .filter(([index]) => documents[index].file.fileStatus === 'complete')
    .map(([index, id]) => {
      return {
        messageId: id,
        payload: documents[index],
        status: PENDING,
        attempts: 0,
        createdAt: new Date()
      }
    })

  if (outboxDocsToInsert.length === 0) {
    return {}
  }

  const { acknowledged, insertedIds } = await db.collection(collection).insertMany(outboxDocsToInsert, { session })
  if (!acknowledged) {
    throw new Error('Failed to insert outbox entries')
  }
  return insertedIds
}

const claimProcessableOutboxEntries = async (instanceId, now = new Date()) => {
  const collection = config.get(outboxCollection)
  const queryLimit = config.get('mongo.outboxQueryLimit')
  const maxAttempts = config.get(outboxMaxAttemptsConfig)
  const leaseTimeoutMs = config.get('messaging.outboxClaimLeaseMs')
  const claimedUntil = new Date(now.getTime() + leaseTimeoutMs)
  const claimedEntries = []

  const filter = {
    attempts: { $lt: maxAttempts },
    $or: [
      { status: PENDING },
      { status: PROCESSING, claimedUntil: { $lt: now } }
    ]
  }

  const update = {
    $set: {
      status: PROCESSING,
      claimedAt: now,
      claimedUntil,
      claimedBy: instanceId
    }
  }

  for (let index = 0; index < queryLimit; index++) {
    const entry = await db.collection(collection).findOneAndUpdate(filter, update, {
      sort: { createdAt: 1 },
      returnDocument: 'before'
    })

    if (!entry) {
      break
    }

    if (entry.status === PROCESSING) {
      const previousOwner = entry.claimedBy || 'unknown'
      const previousExpiry = entry.claimedUntil?.toISOString?.() || String(entry.claimedUntil)
      const reason = `expired_claim previousOwner=${previousOwner} previousClaimedUntil=${previousExpiry}`
      runWithCorrelationId(entry.payload?.messaging?.correlationId, () => logger.warn({
        event: {
          type: 'outbox_claim_reclaimed',
          action: 'reclaim_expired_claim',
          reference: entry._id?.toString(),
          outcome: 'success',
          created: now,
          duration: leaseTimeoutMs * 1000000,
          reason
        },
        process: { name: instanceId }
      }, `Reclaimed expired outbox claim; entryId=${entry.payload?.file?.fileId || entry.messageId}`))
    }

    claimedEntries.push({
      ...entry,
      status: PROCESSING,
      claimedAt: now,
      claimedUntil,
      claimedBy: instanceId
    })
  }

  return claimedEntries
}

const buildClaimedFailurePipeline = (maxAttempts, error, now) => ([
  {
    $set: {
      attempts: { $add: [{ $ifNull: ['$attempts', 0] }, 1] },
      lastAttemptedAt: now,
      ...(error && { error })
    }
  },
  {
    $set: {
      status: {
        $cond: [{ $gte: ['$attempts', maxAttempts] }, PERMANENT_FAILURE, PENDING]
      }
    }
  },
  {
    $unset: ['claimedAt', 'claimedUntil', 'claimedBy']
  }
])

const finalizeClaimedOutboxEntries = async (
  session,
  entryIds,
  instanceId,
  deliveryOutcome,
  error = null,
  now = new Date()
) => {
  const collection = config.get(outboxCollection)
  const maxAttempts = config.get(outboxMaxAttemptsConfig)
  const filter = {
    _id: { $in: entryIds },
    status: PROCESSING,
    claimedBy: instanceId,
    claimedUntil: { $gt: now }
  }
  const options = session ? { session } : {}

  if (deliveryOutcome === DELIVERY_OUTCOME.SUCCEEDED) {
    const updateResult = await db.collection(collection).updateMany(filter, {
      $set: {
        status: SENT,
        lastAttemptedAt: now
      },
      $inc: { attempts: 1 },
      $unset: {
        claimedAt: '',
        claimedUntil: '',
        claimedBy: '',
        error: ''
      }
    }, options)

    if (!updateResult.acknowledged) {
      throw new Error('Failed to finalize claimed outbox entries')
    }

    return updateResult
  } else if (deliveryOutcome === DELIVERY_OUTCOME.FAILED) {
    // Use updateMany with aggregation pipeline to compute terminal status per doc
    const updateResult = await db.collection(collection).updateMany(
      filter,
      buildClaimedFailurePipeline(maxAttempts, error, now),
      options
    )

    if (!updateResult.acknowledged) {
      throw new Error('Failed to finalize claimed outbox entries')
    }

    return updateResult
  } else {
    throw new Error(`Unsupported delivery outcome: ${deliveryOutcome}`)
  }
}

export {
  createOutboxEntries,
  claimProcessableOutboxEntries,
  finalizeClaimedOutboxEntries,
  logTerminalFailuresIfAny
}
