import { createLogger } from '../../../../logging/logger.js'
import { getPendingOutboxEntries, bulkUpdateDeliveryStatus } from '../../../../repos/outbox.js'
import { bulkUpdatePublishedAtDate } from '../../../../repos/metadata.js'
import { publishDocumentUploadMessageBatch } from './publish-document-upload-message-batch.js'
import { SENT, FAILED, BATCH_SIZE } from '../../../../constants/outbox.js'
import { client } from '../../../../data/db.js'

const logger = createLogger()

const publishPendingMessages = async () => {
  const session = client.startSession()

  try {
    const pendingMessages = await getPendingOutboxEntries()

    if (!pendingMessages.length) {
      logger.info('No pending outbox messages to process.')
      return
    }

    logger.info(`Processing ${pendingMessages.length} outbox message(s).`)

    for (let i = 0; i < pendingMessages.length; i += BATCH_SIZE) {
      const batch = pendingMessages.slice(i, i + BATCH_SIZE)

      const { Successful, Failed } = await publishDocumentUploadMessageBatch(batch)

      await session.withTransaction(async () => {
        if (Successful.length > 0) {
          await bulkUpdateDeliveryStatus(session, Successful.map(message => message.Id), SENT)
          await bulkUpdatePublishedAtDate(session, Successful.map(message => message.Id))
        }

        if (Failed.length > 0) {
          await bulkUpdateDeliveryStatus(session, Failed.map(message => message.Id), FAILED, 'Failed to send message')
        }
      })
      logger.info(`Outbox processing complete. Total: ${Successful.length} sent, ${Failed.length} failed`)
    }
  } catch (error) {
    logger.error(error, 'Error publishing pending outbox messages')
    throw error
  } finally {
    await session.endSession()
  }
}

export { publishPendingMessages }
