import { randomUUID } from 'node:crypto'
import { constants as httpConstants } from 'node:http2'

import { config } from '../../../config/index.js'
import { createLogger } from '../../../logging/logger.js'
import { sendAuditEvent } from '../../../messaging/outbound/audit/send-audit-event.js'

const logger = createLogger()
const tracingHeader = config.get('tracing.header')
const MAX_REQUEST_ID_LENGTH = 50

const buildOversizedRequestIdLog = (request, headerLength) => ({
    event: {
        type: 'request_id_too_long',
        action: request.method,
        category: request.path,
        reason: `header_length=${headerLength}`,
        outcome: 'failure',
        kind: httpConstants.HTTP_STATUS_BAD_REQUEST
    }
})

const buildOversizedRequestIdAuditEvent = (request) => {
    const correlationId = randomUUID()

    return {
        correlationid: correlationId,
        security: {
            pmccode: 'AUTH',
            priority: 1,
            details: {
                message: 'x-cdp-request-id header exceeds 50 characters'
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
        'Request rejected because x-cdp-request-id exceeds 50 characters'
    )

    sendAuditEvent(buildOversizedRequestIdAuditEvent(request), request).catch((err) => {
        logger.warn({ msg: 'Failed to send oversized request id audit event', err })
    })

    return h.response({
        message: 'x-cdp-request-id header must be 50 characters or fewer'
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
