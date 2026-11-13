import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import { snsClient } from '../../../sns/client.js'
import { publishBatch } from '../../../sns/publish-batch.js'
import { buildDocumentUploadMessageBatch } from './build-document-upload-message-batch.js'
import { toTenantMessage, sanitizeSourceSystem } from '../../../../logging/tenant-message.js'

const snsTopic = config.get('aws.messaging.topics.documentUploadEvents')

const logger = createLogger()

// A batch can hold entries from more than one source system, so this line carries the
// distinct set under its own key. A filter on sourceSystem= does not match a joined list.
const getSourceSystems = (pendingMessages) => {
  const sourceSystems = new Set(
    pendingMessages
      .map(entry => sanitizeSourceSystem(entry?.payload?.metadata?.service))
      .filter(Boolean)
  )
  return sourceSystems.size ? [...sourceSystems].join(',') : undefined
}

const publishDocumentUploadMessageBatch = async (pendingMessages) => {
  try {
    const documentUploadMessageBatch = buildDocumentUploadMessageBatch(pendingMessages)
    return await publishBatch(snsClient, snsTopic, documentUploadMessageBatch)
  } catch (err) {
    logger.error({
      err,
      tenant: { message: toTenantMessage({ sourceSystems: getSourceSystems(pendingMessages) }) }
    }, 'Error publishing document upload batch')
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
