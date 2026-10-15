import Boom from '@hapi/boom'
import { randomUUID } from 'node:crypto'

import { config } from '../../../config/index.js'
import { createLogger } from '../../../logging/logger.js'
import { sendAuditEvent } from '../../../messaging/outbound/audit/send-audit-event.js'
import { buildOversizedRequestIdLog } from '../../../utils/build-oversized-request-id-log.js'

const logger = createLogger()
const tracingHeader = config.get('tracing.header')
const MAX_REQUEST_ID_LENGTH = 50


const buildOversizedRequestIdAuditEvent = (request, correlationId) => {
  return {
    correlationid: correlationId,
    security: {
      pmccode: PMCCODE.AUTH, // This is a placeholder until we have been supplied with a proper PMCCODE for this event
      priority: 5,
      details: { path: request.path, method: request.method, reason: 'request_id_too_long' }
    },
    audit: {
      entities: [{ entity: 'request', action: 'failed', entityid: correlationId }],
      status: 'failure',
      details: { path: request.path, method: request.method }
    },
    reference: { correlationid: correlationId },
  }
}

export const rejectOversizedRequestId = (request, h) => {
  const correlationId = randomUUID()
  const requestId = request.headers?.[tracingHeader]

  if (typeof requestId !== 'string' || requestId.length <= MAX_REQUEST_ID_LENGTH) {
    return h.continue
  }

  const headerLength = requestId.length
  logger.warn(
    buildOversizedRequestIdLog(request, headerLength, correlationId),
    `Request rejected because ${tracingHeader} exceeds ${MAX_REQUEST_ID_LENGTH} characters`
  )

  sendAuditEvent(buildOversizedRequestIdAuditEvent(request, correlationId), request).catch((err) => {
    logger.warn({ msg: 'Failed to send oversized request id audit event', err })
  })

  throw Boom.badRequest(`${tracingHeader} header must be ${MAX_REQUEST_ID_LENGTH} characters or fewer`)
}

const requestIdValidation = {
  plugin: {
    name: 'request-id-validation',
    register: (server) => {
      server.ext('onRequest', rejectOversizedRequestId)
    }
  }
}

export { requestIdValidation }
