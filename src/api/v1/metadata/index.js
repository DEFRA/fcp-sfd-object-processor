import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'
import { ObjectId } from 'mongodb'

import { getMetadataPageBySbi } from '../../../repos/metadata.js'
import { metadataParamSchema, metadataQuerySchema, metadataResponseSchema } from './schemas/index.js'
import { responseFailAction } from '../../common/helpers/response-fail-action.js'
import { NotFoundError } from '../../../errors/not-found-error.js'
import { config } from '../../../config/index.js'
import { createLogger } from '../../../logging/logger.js'
import { sendAuditEvent } from '../../../messaging/outbound/audit/send-audit-event.js'
import { buildAuditAccounts } from '../../../utils/build-audit-accounts.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')
const tracingHeader = config.get('tracing.header')

// after has already been validated by metadataQuerySchema as a 24 character hex string,
// so createFromHexString cannot throw here.
const toCursor = (after) => after ? ObjectId.createFromHexString(after) : undefined

const READ_ENTITY = Object.freeze({ entity: 'document', action: 'read' })

/**
 * Builds the audit entities for a read. Each returned document is listed by
 * its fileId. A read that returns no documents is still audited: the audit
 * schema requires at least one entity, so it carries a single read entity
 * with no entityid, which the schema permits when the id is not known.
 *
 * @param {Array<{ file: { fileId: string } }>} documents documents returned by the read
 * @returns {Array<{ entity: string, action: string, entityid?: string }>} audit entities
 */
const buildReadEntities = (documents) => documents.length > 0
  ? documents.map(doc => ({ ...READ_ENTITY, entityid: doc.file.fileId }))
  : [{ ...READ_ENTITY }]

/**
 * Sends one document/read audit event per request. The event carries the SBI
 * only: the CRN and the rest of each metadata object are deliberately left out.
 *
 * sendAuditEvent already logs and swallows publish failures. The catch is kept
 * so that an audit failure can never change the status of the response.
 *
 * @param {object} request Hapi request, used for the correlation id and the originating IP
 * @param {number} sbi Single Business Identifier the read was made for
 * @param {Array<{ file: { fileId: string } }>} documents documents returned by the read, empty when none
 * @param {number} pageSize page size applied to the read
 * @returns {Promise<void>}
 */
const sendReadAuditEvent = async (request, sbi, documents, pageSize) => {
  await sendAuditEvent({
    correlationid: request.headers?.[tracingHeader],
    audit: {
      entities: buildReadEntities(documents),
      ...buildAuditAccounts(sbi),
      status: 'success',
      details: { count: documents.length, pageSize }
    }
  }, request).catch((err) => {
    logger.warn(
      { event: { type: 'audit_publish_failed', outcome: 'failure', reason: err.message } },
      'Failed to send metadata read audit event'
    )
  })
}

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
    // Convert sbi from URL param string to integer for database query
    const sbi = Number.parseInt(request.params.sbi, 10)
    const { pageSize, after } = request.query

    try {
      const { documents, hasMore, nextCursor } = await getMetadataPageBySbi(sbi, { pageSize, after: toCursor(after) })

      await sendReadAuditEvent(request, sbi, documents, pageSize)

      return h.response({
        data: documents,
        page: { pageSize, count: documents.length, hasMore, nextCursor }
      }).code(httpConstants.HTTP_STATUS_OK)
    } catch (err) {
      if (err instanceof NotFoundError) {
        await sendReadAuditEvent(request, sbi, [], pageSize)
        return Boom.notFound(err)
      }
      return Boom.internal(err)
    }
  }
}
