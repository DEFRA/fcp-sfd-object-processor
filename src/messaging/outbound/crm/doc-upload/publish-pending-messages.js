import { createLogger } from '../../../../logging/logger.js'
import { getPendingOutboxEntries, updateDeliveryStatus } from '../../../../repos/outbox.js'
import { publishDocumentUploadMessage } from './publish-document-upload-message.js'
import { SENT, FAILED } from '../../../../constants/outbox.js'

const logger = createLogger()

const publishPendingMessages = async () => {
  const pendingMessages = await getPendingOutboxEntries()
  logger.info(pendingMessages.length
    ? `Processing ${pendingMessages.length} outbox messages.`
    : 'No pending outbox messages to process.'
  )

  for (const message of pendingMessages) {
    try {
      await publishDocumentUploadMessage(message.payload)
      await updateDeliveryStatus(message._id, SENT)
    } catch (error) {
      await updateDeliveryStatus(message._id, FAILED, error.message)
    }
  }
}

export { publishPendingMessages }
// find documents in outbox collection with status 'pending'
// use mongo transaction
// send the events via SNS
// update the outbox status to 'sent' or 'failed' based on result
