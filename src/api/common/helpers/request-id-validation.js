import { randomUUID } from 'node:crypto'
import { constants as httpConstants } from 'node:http2'

import { config } from '../../../config/index.js'
import { createLogger } from '../../../logging/logger.js'
import { sendAuditEvent } from '../../../messaging/outbound/audit/send-audit-event.js'
import { buildOversizedRequestIdLog } from '../../../utils/build-oversized-request-id-log.js'

const logger = createLogger()
const tracingHeader = config.get('tracing.header')
const MAX_REQUEST_ID_LENGTH = 50

const buildOversizedRequestIdAuditEvent = (request) => {
  const correlationId = randomUUID()

  return {
    correlationid: correlationId,
    security: {
      pmccode: 'AUTH',
      priority: 1,
      details: {
        message: `${tracingHeader} header exceeds ${MAX_REQUEST_ID_LENGTH} characters`

      }
    },
    audit: {
      entities: [{ entity: 'request', action: 'failed', entityid: correlationId }],
      status: 'failure',
      details: { path: request.path, method: request.method }
    }
  }
}

export const rejectOversizedRequestId = (request, h) => {
  const requestId = request.headers?.[tracingHeader]

  if (typeof requestId !== 'string' || requestId.length <= MAX_REQUEST_ID_LENGTH) {
    return h.continue
  }

  const headerLength = requestId.length
  logger.warn(
    buildOversizedRequestIdLog(request, headerLength),
    `Request rejected because ${tracingHeader} exceeds ${MAX_REQUEST_ID_LENGTH} characters`
  )

  sendAuditEvent(buildOversizedRequestIdAuditEvent(request), request).catch((err) => {
    logger.warn({ msg: 'Failed to send oversized request id audit event', err })
  })

  return h.response({
    message: `${tracingHeader} header must be ${MAX_REQUEST_ID_LENGTH} characters or fewer`
  }).code(httpConstants.HTTP_STATUS_BAD_REQUEST).takeover()
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
