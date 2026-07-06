import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import { snsClient } from '../../../sns/client.js'
import { publishBatch } from '../../../sns/publish-batch.js'
import { buildDocumentUploadMessageBatch } from './build-document-upload-message-batch.js'

const snsTopic = config.get('aws.messaging.topics.documentUploadEvents')

const logger = createLogger()

const publishDocumentUploadMessageBatch = async (pendingMessages) => {
  try {
    const documentUploadMessageBatch = buildDocumentUploadMessageBatch(pendingMessages)
    return await publishBatch(snsClient, snsTopic, documentUploadMessageBatch)
  } catch (err) {
    logger.error(err, 'Error publishing document upload batch')
    return {
      Successful: [],
      Failed: pendingMessages.map(entry => ({
        Id: entry?.payload?.file?.fileId || entry?.messageId,
        Code: err.constructor?.name ?? err.name ?? 'PublishError',
        Message: err.message
      }))
    }
  }
}

export { publishDocumentUploadMessageBatch }
