import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import {
  claimProcessableOutboxEntries,
  finalizeClaimedOutboxEntries,
  logTerminalFailuresIfAny
} from '../../../../repos/outbox.js'
import { bulkUpdatePublishedAtDate } from '../../../../repos/metadata.js'
import { publishDocumentUploadMessageBatch } from './publish-document-upload-message-batch.js'
import { PENDING, SENT, FAILED, BATCH_SIZE } from '../../../../constants/outbox.js'
import { client } from '../../../../data/db.js'
import { outboxWorkerId } from '../../outbox-worker-id.js'

const logger = createLogger()
const publishFailureMessage = 'Failed to send message'

const getEntryId = (entry) => entry?.payload?.file?.fileId || entry?.messageId

const mapPublishResultsToEntries = (batch, results) => {
  const entriesById = new Map(batch.map(entry => [getEntryId(entry), entry]))

  return results.flatMap(result => {
    const entry = entriesById.get(result.Id)
    if (!entry) {
      logger.warn({
        event: {
          type: 'outbox_publish_result_unmatched',
          outcome: 'failure',
          entryId: result.Id,
          reason: 'publish_result_did_not_match_claimed_entry'
        }
      }, 'SNS publish result did not match a claimed outbox entry')
      return []
    }
    return [entry]
  })
}

const finalizeEntries = async (session, entries, deliveryStatus, error = null) => {
  const finalized = []
  const rejected = []

  for (const entry of entries) {
    const result = await finalizeClaimedOutboxEntries(
      session,
      [entry._id],
      outboxWorkerId,
      deliveryStatus,
      error
    )

    if (result.matchedCount === 1) {
      finalized.push(entry)
    } else {
      rejected.push(entry)
    }
  }

  return { finalized, rejected }
}

const logRejectedFinalizations = (entries) => {
  entries.forEach(entry => {
    logger.warn({
      event: {
        type: 'outbox_finalization_rejected',
        reference: entry._id?.toString(),
        outcome: 'failure',
        entryId: getEntryId(entry),
        claimedBy: outboxWorkerId,
        reason: 'claim_expired_or_ownership_lost'
      }
    }, 'Outbox entry could not be finalized by this worker')
  })
}

const logFinalizations = (entries, status) => {
  entries.forEach(entry => {
    logger.info({
      event: {
        type: 'outbox_finalized',
        reference: entry._id?.toString(),
        outcome: status === SENT ? 'success' : 'failure',
        entryId: getEntryId(entry),
        claimedBy: outboxWorkerId,
        status,
        attempts: (entry.attempts || 0) + 1
      }
    }, `Outbox entry finalized as ${status}`)
  })
}

const logTerminalFailures = (entries, failedResults) => {
  entries.forEach(entry => {
    const entryId = getEntryId(entry) || null
    const failedInfo = failedResults.find(failure => failure.Id === entryId) || {}
    const reason = failedInfo.Message || failedInfo.Code || 'failed_to_publish'

    logger.error({
      event: {
        type: 'outbox_terminal_failure_imminent',
        reference: entry._id?.toString(),
        outcome: 'failure',
        entryId,
        attempts: (entry.attempts || 0) + 1,
        reason
      }
    }, 'Outbox entry will reach FAILED after this attempt')
  })
}

const publishPendingMessages = async () => {
  const session = client.startSession()

  try {
    const pendingMessages = await claimProcessableOutboxEntries(outboxWorkerId)

    if (!pendingMessages.length) {
      logger.info('No pending outbox messages to process.')
      return
    }

    pendingMessages.forEach(entry => {
      logger.info({
        event: {
          type: 'outbox_claimed',
          reference: entry._id?.toString(),
          outcome: 'success',
          entryId: getEntryId(entry),
          claimedBy: entry.claimedBy,
          claimedAt: entry.claimedAt,
          claimedUntil: entry.claimedUntil
        }
      }, 'Outbox entry claimed for processing')
    })

    logger.info(`Processing ${pendingMessages.length} outbox message(s).`)

    for (let i = 0; i < pendingMessages.length; i += BATCH_SIZE) {
      const batch = pendingMessages.slice(i, i + BATCH_SIZE)
      const { Successful, Failed } = await publishDocumentUploadMessageBatch(batch)
      const successfulEntries = mapPublishResultsToEntries(batch, Successful)
      const failedEntries = mapPublishResultsToEntries(batch, Failed)
      let finalizedSuccessful = []
      let finalizedFailed = []
      let rejected = []

      await session.withTransaction(async () => {
        const successfulResult = await finalizeEntries(session, successfulEntries, SENT)
        const failedResult = await finalizeEntries(session, failedEntries, FAILED, publishFailureMessage)

        finalizedSuccessful = successfulResult.finalized
        finalizedFailed = failedResult.finalized
        rejected = [...successfulResult.rejected, ...failedResult.rejected]

        if (finalizedSuccessful.length > 0) {
          await bulkUpdatePublishedAtDate(session, finalizedSuccessful.map(getEntryId))
        }
      })

      logFinalizations(finalizedSuccessful, SENT)
      logRejectedFinalizations(rejected)

      if (finalizedFailed.length > 0) {
        const maxAttempts = config.get('messaging.outboxMaxAttempts')
        const terminalEntries = finalizedFailed.filter(entry => ((entry.attempts || 0) + 1) >= maxAttempts)
        const retryableEntries = finalizedFailed.filter(entry => ((entry.attempts || 0) + 1) < maxAttempts)

        logFinalizations(retryableEntries, PENDING)
        logFinalizations(terminalEntries, FAILED)
        logTerminalFailures(terminalEntries, Failed)

        await logTerminalFailuresIfAny(
          config.get('mongo.collections.outbox'),
          finalizedFailed.map(getEntryId),
          maxAttempts,
          null,
          publishFailureMessage
        )
      }

      logger.info(`Outbox processing complete. Total: ${finalizedSuccessful.length} sent, ${finalizedFailed.length} failed, ${rejected.length} rejected`)
    }
  } catch (error) {
    logger.error(error, 'Error publishing pending outbox messages')
    throw error
  } finally {
    await session.endSession()
  }
}

export { publishPendingMessages }
