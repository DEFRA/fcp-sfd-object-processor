import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import { snsClient } from '../../../sns/client.js'
import { publishBatch } from '../../../sns/publish-batch.js'
import { buildDocumentUploadMessageBatch } from './document-upload-message-batch.js'

const snsTopic = config.get('aws.messaging.topics.documentUploadEvents')

const logger = createLogger()

const publishDocumentUploadMessageBatch = async (pendingMessages) => {
  try {
    const documentUploadMessageBatch = buildDocumentUploadMessageBatch(pendingMessages)
    const snsPublishResponse = await publishBatch(snsClient, snsTopic, documentUploadMessageBatch)
    return snsPublishResponse
  } catch (error) {
    logger.error(error, 'Error publishing document upload batch')
    throw error
  }
}

export { publishDocumentUploadMessageBatch }
