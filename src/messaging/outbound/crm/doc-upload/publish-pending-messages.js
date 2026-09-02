import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import {
  claimProcessableOutboxEntries,
  finalizeClaimedOutboxEntries,
  logTerminalFailuresIfAny
} from '../../../../repos/outbox.js'
import { bulkUpdatePublishedAtDate } from '../../../../repos/metadata.js'
import { publishDocumentUploadMessageBatch } from './publish-document-upload-message-batch.js'
import { PENDING, SENT, DELIVERY_OUTCOME, PERMANENT_FAILURE, BATCH_SIZE } from '../../../../constants/outbox.js'
import { client } from '../../../../data/db.js'
import { outboxWorkerId } from '../../outbox-worker-id.js'
import { runWithCorrelationId } from '../../../../logging/correlation-id-store.js'

const logger = createLogger()
const publishFailureMessage = 'Failed to send message'
const outboxMaxAttemptsConfig = 'messaging.outboxMaxAttempts'
const millisecondsToNanoseconds = 1000000

const getEntryId = (entry) => entry?.payload?.file?.fileId || entry?.messageId

// Mirrors the status buildClaimedFailurePipeline computes in the database. The
// driver's UpdateResult reports only counts, so the status has to be derived
// here from the same attempt count the pipeline evaluated. attempts is set at
// claim time and no other worker can change it while this claim is held.
const resolveFailedStatus = (attempts, maxAttempts) =>
  attempts >= maxAttempts ? PERMANENT_FAILURE : PENDING

const runWithEntryCorrelationId = (entry, fn) =>
  runWithCorrelationId(entry?.payload?.messaging?.correlationId, fn)

const getFailureDetails = (entry, failedResults) => {
  const entryId = getEntryId(entry)
  const failure = failedResults.find(result => result.Id === entryId) || {}
  const reason = failure.Message || failure.Code || 'failed_to_publish'

  return {
    reason,
    error: {
      type: 'outbox_publish_failure',
      ...(failure.Code && { code: failure.Code }),
      message: reason
    }
  }
}

const mapPublishResultsToEntries = (batch, results) => {
  const entriesById = new Map(batch.map(entry => [getEntryId(entry), entry]))

  return results.flatMap(result => {
    const entry = entriesById.get(result.Id)
    if (!entry) {
      const reason = 'publish_result_did_not_match_claimed_entry'
      // No matching outbox entry means no journey correlationId is available for this line.
      logger.warn({
        event: {
          type: 'outbox_publish_result_unmatched',
          action: 'match_publish_result',
          outcome: 'failure',
          reason
        },
        error: {
          type: 'outbox_publish_result_unmatched',
          message: reason
        }
      }, `SNS publish result did not match a claimed outbox entry; entryId=${result.Id}`)
      return []
    }
    return [entry]
  })
}

const buildEntryError = (entry, failedResults) => {
  return getFailureDetails(entry, failedResults).error
}

const finalizeEntries = async (session, entries, deliveryOutcome, failedResults = []) => {
  const maxAttempts = config.get(outboxMaxAttemptsConfig)
  const finalized = []
  const rejected = []

  for (const entry of entries) {
    const error = deliveryOutcome === DELIVERY_OUTCOME.FAILED ? buildEntryError(entry, failedResults) : null
    const result = await finalizeClaimedOutboxEntries(
      session,
      [entry._id],
      outboxWorkerId,
      deliveryOutcome,
      error
    )

    if (result.matchedCount === 1) {
      const status = deliveryOutcome === DELIVERY_OUTCOME.SUCCEEDED
        ? SENT
        : resolveFailedStatus(entry.attempts, maxAttempts)
      finalized.push({ ...entry, status })
    } else {
      rejected.push(entry)
    }
  }

  return { finalized, rejected }
}

const logRejectedFinalizations = (entries) => {
  entries.forEach(entry => {
    runWithEntryCorrelationId(entry, () => logger.warn({
      event: {
        type: 'outbox_finalization_rejected',
        action: 'finalize_claim',
        reference: entry._id?.toString(),
        outcome: 'failure',
        reason: 'claim_expired_or_ownership_lost'
      },
      process: { name: outboxWorkerId },
      error: {
        type: 'outbox_claim_ownership_error',
        message: 'claim_expired_or_ownership_lost'
      }
    }, `Outbox entry could not be finalized by this worker; entryId=${getEntryId(entry)}`))
  })
}

const logFinalizations = (entries, status, failedResults = []) => {
  entries.forEach(entry => {
    const attempts = entry.attempts
    const failureDetails = status === SENT ? null : getFailureDetails(entry, failedResults)
    runWithEntryCorrelationId(entry, () => logger.info({
      event: {
        type: 'outbox_finalized',
        action: `finalize_${status.toLowerCase()}`,
        reference: entry._id?.toString(),
        outcome: status === SENT ? 'success' : 'failure',
        ...(failureDetails && { reason: failureDetails.reason })
      },
      process: { name: outboxWorkerId },
      ...(failureDetails && { error: failureDetails.error })
    }, `Outbox entry finalized as ${status}; entryId=${getEntryId(entry)}; attempt=${attempts}`))
  })
}

const logTerminalFailures = (entries, failedResults) => {
  entries.forEach(entry => {
    const attempts = entry.attempts
    const failureDetails = getFailureDetails(entry, failedResults)

    runWithEntryCorrelationId(entry, () => logger.error({
      event: {
        type: 'outbox_terminal_failure_imminent',
        action: 'finalize_failed',
        reference: entry._id?.toString(),
        outcome: 'failure',
        reason: failureDetails.reason
      },
      process: { name: outboxWorkerId },
      error: failureDetails.error
    }, `Outbox entry will reach PERMANENT_FAILURE after this attempt; entryId=${getEntryId(entry)}; attempt=${attempts}`))
  })
}

const publishPendingMessages = async () => {
  const session = client.startSession()

  try {
    const pendingMessages = await claimProcessableOutboxEntries(outboxWorkerId)

    // Poll and batch summaries can span multiple journeys, so they intentionally have no transaction.id.
    if (!pendingMessages.length) {
      logger.info('No pending outbox messages to process.')
      return
    }

    pendingMessages.forEach(entry => {
      const claimDurationMs = new Date(entry.claimedUntil).getTime() - new Date(entry.claimedAt).getTime()
      runWithEntryCorrelationId(entry, () => logger.info({
        event: {
          type: 'outbox_claimed',
          action: 'claim',
          reference: entry._id?.toString(),
          outcome: 'success',
          created: entry.claimedAt,
          duration: Math.max(0, claimDurationMs) * millisecondsToNanoseconds
        },
        process: { name: entry.claimedBy }
      }, `Outbox entry claimed for processing; entryId=${getEntryId(entry)}; attempt=${entry.attempts}`))
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
        const successfulResult = await finalizeEntries(session, successfulEntries, DELIVERY_OUTCOME.SUCCEEDED)
        const failedResult = await finalizeEntries(session, failedEntries, DELIVERY_OUTCOME.FAILED, Failed)

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
        const maxAttempts = config.get(outboxMaxAttemptsConfig)
        const terminalEntries = finalizedFailed.filter(entry => entry.status === PERMANENT_FAILURE)
        const retryableEntries = finalizedFailed.filter(entry => entry.status !== PERMANENT_FAILURE)

        logFinalizations(retryableEntries, PENDING, Failed)
        logFinalizations(terminalEntries, PERMANENT_FAILURE, Failed)
        logTerminalFailures(terminalEntries, Failed)

        await logTerminalFailuresIfAny(
          config.get('mongo.collections.outbox'),
          finalizedFailed.map(getEntryId),
          maxAttempts,
          null,
          publishFailureMessage,
          outboxWorkerId
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

export { publishPendingMessages, buildEntryError }
