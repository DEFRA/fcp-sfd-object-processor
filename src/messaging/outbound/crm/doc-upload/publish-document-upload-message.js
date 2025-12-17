import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import { snsClient } from '../../../sns/client.js'
import { publish } from '../../../sns/publish.js'
import { buildDocumentUploadMessage } from './document-upload-message.js'

const snsTopic = config.get('aws.messaging.topics.documentUploadEvents')

const logger = createLogger()

const publishDocumentUploadMessage = async (payload) => {
  const documentUploadMessage = buildDocumentUploadMessage(payload)

  try {
    await publish(snsClient, snsTopic, documentUploadMessage)
  } catch (error) {
    logger.error(error, 'Error publishing document upload event')
  }
}

export { publishDocumentUploadMessage }
