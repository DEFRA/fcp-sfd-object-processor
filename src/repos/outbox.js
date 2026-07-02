import { config } from '../config/index.js'
import { PENDING, FAILED, SENT } from '../constants/outbox.js'
import { db } from '../data/db.js'
import { createLogger } from '../logging/logger.js'
import { sendAuditEvent } from '../messaging/outbound/audit/send-audit-event.js'

const logger = createLogger()

const outboxCollection = 'mongo.collections.outbox'

const buildFailurePipeline = (maxAttempts, errorMessage) => ([
  {
    $set: {
      lastAttemptedAt: new Date(),
      ...(errorMessage && { error: errorMessage })
    }
  },
  {
    $set: {
      attempts: { $add: ['$attempts', 1] }
    }
  },
  {
    $set: {
      status: {
        // `attempts` has already been incremented in the previous stage,
        // compare the updated value against `maxAttempts` to avoid double-increment.
        $cond: [{ $gte: ['$attempts', maxAttempts] }, FAILED, PENDING]
      }
    }
  }
])

const performSentUpdate = (collectionName, statusValue, filterObj, sess) => {
  const updateDoc = {
    $set: {
      status: statusValue,
      lastAttemptedAt: new Date()
    },
    $inc: { attempts: 1 }
  }
  return db.collection(collectionName).updateMany(filterObj, updateDoc, { session: sess })
}

const performFailureUpdate = (collectionName, filterObj, pipeline, sess) => {
  return db.collection(collectionName).updateMany(filterObj, pipeline, { session: sess })
}

const logTerminalFailuresIfAny = async (collectionName, fileIdsArr, maxAttemptsVal, sess, errMsg) => {
  const terminalFilter = {
    'payload.file.fileId': { $in: fileIdsArr },
    status: FAILED,
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

  for (const doc of terminalDocs) {
    const entryId = doc.payload?.file?.fileId || null
    const attempts = doc.attempts
    const reason = errMsg || 'terminal_failure'
    logger.error({
      event: {
        type: 'outbox_terminal_failure',
        reference: doc._id?.toString(),
        outcome: 'failure',
        entryId,
        attempts,
        reason
      }
    }, 'Outbox entry reached FAILED after max attempts')
    try {
      await sendAuditEvent({
        audit: {
          entities: [{ entity: 'document', action: 'failed', entityid: entryId ?? '' }],
          status: 'failure',
          details: { reason, attempts }
        }
      })
    } catch (err) {
      logger.warn({
        event: {
          type: 'audit_event_send_failure',
          outcome: 'failure',
          entityid: entryId ?? ''
        },
        error: {
          code: err.code ?? null,
          message: err.message,
          stack_trace: err.stack,
          type: err?.constructor?.name || err?.name || 'Error'
        }
      }, 'Failed to send audit event')
    }
  }
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

const getProcessableOutboxEntries = async () => {
  const collection = config.get(outboxCollection)
  const queryLimit = config.get('mongo.outboxQueryLimit')
  const maxAttempts = config.get('messaging.outboxMaxAttempts')

  const processableEntries = await db.collection(collection)
    .find({ status: { $in: [PENDING, FAILED] }, attempts: { $lt: maxAttempts } })
    .limit(queryLimit)
    .toArray()

  return processableEntries
}

const bulkUpdateDeliveryStatus = async (session, fileIds, status, error = null) => {
  const collection = config.get(outboxCollection)
  const maxAttempts = config.get('messaging.outboxMaxAttempts')

  const filter = { 'payload.file.fileId': { $in: fileIds } }

  let updateResult

  // Note: `status` signals the outcome of this delivery attempt as passed
  // by the caller. It does not necessarily represent the final persisted
  // status for the outbox entry — after the update the entry may remain
  // `PENDING` if `attempts` (after increment) are still below `maxAttempts`.

  if (status === SENT) {
    // On successful delivery: set status, lastAttemptedAt and increment attempts
    updateResult = await performSentUpdate(collection, status, filter, session)
  } else {
    // On failure: increment attempts, set lastAttemptedAt and error; only mark FINAL FAILED
    // when attempts after increment reach or exceed maxAttempts. Use update pipeline so we can
    // compute the new attempts value and set status conditionally.
    const pipeline = buildFailurePipeline(maxAttempts, error)
    updateResult = await performFailureUpdate(collection, filter, pipeline, session)
  }

  if (!updateResult.acknowledged) {
    throw new Error('Failed to update outbox entries')
  }

  // If we just processed failures, log any entries that have reached terminal FAILED status
  if (status === FAILED) {
    try {
      await logTerminalFailuresIfAny(collection, fileIds, maxAttempts, session, error)
    } catch (err) {
      // Non-fatal: log but don't fail the transaction because of logging
      logger.error({ err }, 'Failed to log terminal outbox entries')
    }
  }

  return updateResult
}

export {
  createOutboxEntries,
  getProcessableOutboxEntries,
  bulkUpdateDeliveryStatus
}
