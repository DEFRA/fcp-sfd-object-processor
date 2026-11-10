import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import { runWithCorrelationId } from '../../../../logging/correlation-id-store.js'
import {
  MESSAGE_TOO_LARGE_CODE,
  SNS_MAX_PAYLOAD_BYTES,
  SNS_PAYLOAD_SAFETY_MARGIN_BYTES
} from '../../../../constants/outbox.js'
import { snsClient } from '../../../sns/client.js'
import { publishBatch } from '../../../sns/publish-batch.js'
import { buildDocumentUploadMessageBatch } from './build-document-upload-message-batch.js'
import { splitBatchBySize } from './split-batch-by-size.js'

const snsTopic = config.get('aws.messaging.topics.documentUploadEvents')

const logger = createLogger()

const maxMessageBytes = SNS_MAX_PAYLOAD_BYTES - SNS_PAYLOAD_SAFETY_MARGIN_BYTES
const batchRequestTooLongErrorName = 'BatchRequestTooLongException'
const publishErrorLogMessage = 'Error publishing document upload batch'

const getEntryId = (entry) => entry?.payload?.file?.fileId || entry?.messageId

const failEntriesFromError = (entries, err) => entries.map(entry => ({
  Id: getEntryId(entry),
  Code: err.constructor?.name ?? err.name ?? 'PublishError',
  Message: err.message
}))

// The message holds byte counts only. The published message contains the CRN
// and user free text, so none of it may reach a Failed entry or a log line.
const failOversizedMessage = ({ bytes }, entry) => {
  const entryId = getEntryId(entry)

  runWithCorrelationId(entry?.payload?.messaging?.correlationId, () => logger.warn({
    event: {
      type: 'outbox_message_too_large',
      action: 'size_check',
      outcome: 'failure',
      reference: String(entry?._id)
    }
  }, `Outbox message exceeds SNS size limit; entryId=${entryId}; bytes=${bytes}; limit=${maxMessageBytes}`))

  return {
    Id: entryId,
    Code: MESSAGE_TOO_LARGE_CODE,
    Message: `message_exceeds_sns_limit bytes=${bytes} limit=${maxMessageBytes}`
  }
}

// Publishes the batches one after another and merges their results.
const publishSequentially = async (batches, entryByMessage) => {
  const Successful = []
  const Failed = []

  for (const batch of batches) {
    const result = await publishOneBatch(batch, entryByMessage)
    Successful.push(...result.Successful)
    Failed.push(...result.Failed)
  }

  return { Successful, Failed }
}

const publishOneBatch = async (batch, entryByMessage) => {
  try {
    const response = await publishBatch(snsClient, snsTopic, batch)
    return { Successful: response.Successful ?? [], Failed: response.Failed ?? [] }
  } catch (err) {
    // The splitter's byte count is an estimate. If SNS still rejects a batch as
    // too long, republish its entries one per call within the same claim, so only
    // the entry rejected on its own fails. Any other error fails the whole batch.
    // A lone entry is never republished.
    if (err.name === batchRequestTooLongErrorName && batch.length > 1) {
      return publishSequentially(batch.map(message => [message]), entryByMessage)
    }

    logger.error(err, publishErrorLogMessage)
    return {
      Successful: [],
      Failed: failEntriesFromError(batch.map(message => entryByMessage.get(message)), err)
    }
  }
}

/**
 * Publishes claimed outbox entries to SNS in batches bounded by serialised size.
 * A message over the size limit on its own is failed locally and never sent, so
 * it cannot make SNS reject a request that carries its neighbours.
 *
 * @param {object[]} pendingMessages claimed outbox entries
 * @returns {Promise<{ Successful: object[], Failed: object[] }>}
 */
const publishDocumentUploadMessageBatch = async (pendingMessages) => {
  let messages
  try {
    messages = buildDocumentUploadMessageBatch(pendingMessages)
  } catch (err) {
    logger.error(err, publishErrorLogMessage)
    return { Successful: [], Failed: failEntriesFromError(pendingMessages, err) }
  }

  const entryByMessage = new Map(messages.map((message, index) => [message, pendingMessages[index]]))
  const { batches, oversized } = splitBatchBySize(messages, maxMessageBytes)

  const oversizedFailures = oversized.map(item => failOversizedMessage(item, entryByMessage.get(item.message)))
  const published = await publishSequentially(batches, entryByMessage)

  return {
    Successful: published.Successful,
    Failed: [...oversizedFailures, ...published.Failed]
  }
}

export { publishDocumentUploadMessageBatch }
