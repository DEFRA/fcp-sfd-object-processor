import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import { getProcessableOutboxEntries, bulkUpdateDeliveryStatus, logTerminalFailuresIfAny } from '../../../../repos/outbox.js'
import { bulkUpdatePublishedAtDate } from '../../../../repos/metadata.js'
import { publishDocumentUploadMessageBatch } from './publish-document-upload-message-batch.js'
import { SENT, FAILED, BATCH_SIZE } from '../../../../constants/outbox.js'
import { client } from '../../../../data/db.js'

const logger = createLogger()

const publishPendingMessages = async () => {
  const session = client.startSession()

  try {
    const pendingMessages = await getProcessableOutboxEntries()

    if (!pendingMessages.length) {
      logger.info('No pending outbox messages to process.')
      return
    }

    logger.info(`Processing ${pendingMessages.length} outbox message(s).`)

    for (let i = 0; i < pendingMessages.length; i += BATCH_SIZE) {
      const batch = pendingMessages.slice(i, i + BATCH_SIZE)

      const { Successful, Failed } = await publishDocumentUploadMessageBatch(batch)

      // Cross-reference failed IDs against the batch to detect entries
      // that will reach terminal FAILED state after this attempt and log
      // a structured error for them.
      if (Failed.length > 0) {
        const maxAttempts = config.get('messaging.outboxMaxAttempts')
        const failedIds = new Set(Failed.map(f => f.Id))

        const imminentTerminal = batch.filter(entry => {
          const entryId = entry?.payload?.file?.fileId || entry?.messageId
          return failedIds.has(entryId) && ((entry.attempts || 0) + 1) >= maxAttempts
        })

        imminentTerminal.forEach(entry => {
          const entryId = entry?.payload?.file?.fileId || entry?.messageId || null
          const attempts = (entry.attempts || 0) + 1
          const failedInfo = Failed.find(f => f.Id === entryId) || {}
          const reason = failedInfo.Message || failedInfo.Code || 'failed_to_publish'

          logger.error({
            event: {
              type: 'outbox_terminal_failure_imminent',
              reference: entry._id?.toString(),
              outcome: 'failure',
              entryId,
              attempts,
              reason
            }
          }, 'Outbox entry will reach FAILED after this attempt')
        })
      }

      await session.withTransaction(async () => {
        if (Successful.length > 0) {
          const messageIds = Successful.map(message => message.Id)
          await bulkUpdateDeliveryStatus(session, messageIds, SENT)
          await bulkUpdatePublishedAtDate(session, messageIds)
        }

        if (Failed.length > 0) {
          await bulkUpdateDeliveryStatus(session, Failed.map(message => message.Id), FAILED, 'Failed to send message')
        }
      })

      // Transaction committed — emit audit events for terminal failures outside the transaction
      // boundary to prevent duplicate events if the driver retries the transaction callback.
      if (Failed.length > 0) {
        const collection = config.get('mongo.collections.outbox')
        const maxAttempts = config.get('messaging.outboxMaxAttempts')
        await logTerminalFailuresIfAny(collection, Failed.map(message => message.Id), maxAttempts, null, 'Failed to send message')
      }

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
