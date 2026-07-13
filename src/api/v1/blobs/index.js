import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'

import { getS3ReferenceByFileId } from '../../../repos/metadata.js'
import { blobParamSchema } from './schemas/params.js'
import { generatePresignedUrl } from '../../../repos/s3.js'
import { NotFoundError } from '../../../errors/not-found-error.js'
import { config } from '../../../config/index.js'
import { createLogger } from '../../../logging/logger.js'
import { blobResponseSchema } from './schemas/responses.js'
import { sendAuditEvent } from '../../../messaging/outbound/audit/send-audit-event.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')
const tracingHeader = config.get('tracing.header')

export const blobRoute = {
  method: 'GET',
  path: `${baseUrl}/blob/{fileId}`,
  options: {
    tags: ['api', 'blob'],
    validate: {
      params: blobParamSchema,
      failAction: (_request, _h, err) => {
        throw err
      }
    },
    response: {
      status: blobResponseSchema
    }
  },
  handler: async (request, h) => {
    try {
      const { fileId } = request.params

      const { s3: s3Reference } = await getS3ReferenceByFileId(fileId)

      const { url } = await generatePresignedUrl(s3Reference)

      // Fire-and-forget-safe: catch prevents an audit publish failure from
      // turning this successful presigned URL response into a 500.
      await sendAuditEvent({
        correlationid: request?.headers?.[tracingHeader],
        audit: {
          entities: [{ entity: 'document', action: 'read', entityid: fileId }],
          status: 'success',
          details: {}
        }
      }, request).catch((err) => {
        logger.warn({ msg: 'Failed to send blob read audit event', err })
      })

      return h.response({ data: { url } }).code(httpConstants.HTTP_STATUS_OK)
    } catch (err) {
      if (err instanceof NotFoundError) {
        return Boom.notFound(err)
      }
      return Boom.internal(err)
    }
  }
}
