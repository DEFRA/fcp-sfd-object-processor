import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'
import { ObjectId } from 'mongodb'

import { getMetadataPageBySbi } from '../../../repos/metadata.js'
import { metadataParamSchema, metadataQuerySchema, metadataResponseSchema } from './schemas/index.js'
import { responseFailAction } from '../../common/helpers/response-fail-action.js'
import { NotFoundError } from '../../../errors/not-found-error.js'
import { config } from '../../../config/index.js'
import { sendAuditEvent } from '../../../messaging/outbound/audit/send-audit-event.js'
import { buildAuditAccounts } from '../../../utils/build-audit-accounts.js'

const baseUrl = config.get('baseUrl.v1')
const tracingHeader = config.get('tracing.header')

// after has already been validated by metadataQuerySchema as a 24 character hex string,
// so createFromHexString cannot throw here.
const toCursor = (after) => after ? ObjectId.createFromHexString(after) : undefined

export const metadataRoute = {
  method: 'GET',
  path: `${baseUrl}/metadata/sbi/{sbi}`,
  options: {
    tags: ['api', 'metadata'],
    validate: {
      params: metadataParamSchema,
      query: metadataQuerySchema,
      failAction: (_request, _h, err) => {
        throw err
      }
    },
    response: {
      status: metadataResponseSchema,
      failAction: responseFailAction
    }
  },
  handler: async (request, h) => {
    try {
      // Convert sbi from URL param string to integer for database query
      const sbi = Number.parseInt(request.params.sbi, 10)
      const { pageSize, after } = request.query
      const { documents, hasMore, nextCursor } = await getMetadataPageBySbi(sbi, { pageSize, after: toCursor(after) })

      // Promise.allSettled fires audit events concurrently and never rejects,
      // so a broker/network failure can't turn this successful read into a 500.
      await Promise.allSettled(documents.map(doc => sendAuditEvent({
        correlationid: request?.headers?.[tracingHeader],
        audit: {
          entities: [{ entity: 'document', action: 'read', entityid: doc.file.fileId }],
          ...buildAuditAccounts(sbi),
          status: 'success',
          details: {}
        }
      }, request)))

      return h.response({
        data: documents,
        page: { pageSize, count: documents.length, hasMore, nextCursor }
      }).code(httpConstants.HTTP_STATUS_OK)
    } catch (err) {
      if (err instanceof NotFoundError) {
        return Boom.notFound(err)
      }
      return Boom.internal(err)
    }
  }
}
