import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'

import { getMetadataBySbi } from '../../../repos/metadata.js'
import { metadataParamSchema, metadataResponseSchema } from './schemas/index.js'
import { NotFoundError } from '../../../errors/not-found-error.js'
import { config } from '../../../config/index.js'
import { sendAuditEvent } from '../../../messaging/outbound/audit/send-audit-event.js'

const baseUrl = config.get('baseUrl.v1')
const tracingHeader = config.get('tracing.header')

export const metadataRoute = {
  method: 'GET',
  path: `${baseUrl}/metadata/sbi/{sbi}`,
  options: {
    tags: ['api', 'metadata'],
    validate: {
      params: metadataParamSchema,
      failAction: (_request, _h, err) => {
        throw err
      }
    },
    response: {
      status: metadataResponseSchema
    }
  },
  handler: async (request, h) => {
    try {
      // Convert sbi from URL param string to integer for database query
      const sbi = Number.parseInt(request.params.sbi, 10)
      const documents = await getMetadataBySbi(sbi)

      for (const doc of documents) {
        try {
          await sendAuditEvent({
            correlationid: request?.headers?.[tracingHeader],
            audit: {
              entities: [{ entity: 'document', action: 'read', entityid: doc.file.fileId }],
              accounts: { sbi: String(sbi) },
              status: 'success',
              details: {}
            }
          })
        } catch (err) {
          request.logger.warn({
            event: {
              type: 'audit_event_send_failure',
              outcome: 'failure',
              entityid: doc.file.fileId,
              accounts: { sbi: String(sbi) }
            },
            error: {
              code: err.code ?? null,
              message: err.message,
              stack_trace: err.stack,
              type: err?.constructor?.name || err?.name || 'Error'
            }
          }, 'Failed to send audit event')
        }
      }

      return h.response({ data: documents }).code(httpConstants.HTTP_STATUS_OK)
    } catch (err) {
      if (err instanceof NotFoundError) {
        return Boom.notFound(err)
      }
      return Boom.internal(err)
    }
  }
}
