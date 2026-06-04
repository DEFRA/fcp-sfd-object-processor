import { config } from '../config/index.js'
import { PENDING, FAILED, SENT } from '../constants/outbox.js'
import { db } from '../data/db.js'
import { createLogger } from '../logging/logger.js'

const logger = createLogger()

const outboxCollection = 'mongo.collections.outbox'

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
    const updateDoc = {
      $set: {
        status,
        lastAttemptedAt: new Date()
      },
      $inc: {
        attempts: 1
      }
    }
    updateResult = await db.collection(collection).updateMany(filter, updateDoc, { session })
  } else {
    // On failure: increment attempts, set lastAttemptedAt and error; only mark FINAL FAILED
    // when attempts after increment reach or exceed maxAttempts. Use update pipeline so we can
    // compute the new attempts value and set status conditionally.
    const pipeline = [
      {
        $set: {
          lastAttemptedAt: new Date(),
          ...(error && { error })
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
    ]

    updateResult = await db.collection(collection).updateMany(filter, pipeline, { session })
  }

  if (!updateResult.acknowledged) {
    throw new Error('Failed to update outbox entries')
  }

  // If we just processed failures, log any entries that have reached terminal FAILED status
  if (status === FAILED) {
    try {
      const terminalFilter = {
        'payload.file.fileId': { $in: fileIds },
        status: FAILED,
        attempts: { $gte: maxAttempts }
      }
      // Only query for terminal docs when there is a possibility of any
      // reaching terminal state after the increment. Check for any entries
      // with attempts >= maxAttempts - 1; if none, skip the heavier query.
      const potentialTerminalFilter = {
        'payload.file.fileId': { $in: fileIds },
        attempts: { $gte: Math.max(0, maxAttempts - 1) }
      }

      const potentialCount = await db.collection(collection).countDocuments(potentialTerminalFilter, { session })
      if (potentialCount === 0) {
        return updateResult
      }

      const terminalDocs = await db.collection(collection)
        .find(terminalFilter, { session })
        .toArray()

      terminalDocs.forEach(doc => {
        const entryId = doc.payload?.file?.fileId || null
        const attempts = doc.attempts
        const reason = error || 'terminal_failure'
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
      })
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
