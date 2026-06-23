import Boom from '@hapi/boom'

import { constants as httpConstants } from 'node:http2'
import { createLogger } from '../../../logging/logger.js'
import { callbackPayloadSchema, callbackResponseSchema } from './schema.js'
import { config } from '../../../config/index.js'
import { persistMetadataWithOutbox, persistValidationFailureStatus } from '../../../services/metadata-service.js'
import { metricsCounter } from '../../common/helpers/metrics.js'
import { validateCallbackPayload } from './validation/validate-callback-payload.js'
import { buildCallbackValidationFailureLog, buildCallbackPersistFailureLog } from '../../../utils/build-callback-validation-failure-log.js'
import { publishAuditEvent } from '../../../messaging/outbound/audit/publish-audit-event.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')
const tracingHeader = config.get('tracing.header')

/**
 * Hapi route definition for the CDP Uploader callback endpoint.
 *
 * Validation stages:
 *   1. Joi schema validation (callbackPayloadSchema via Hapi validate.payload)
 *   2. Contract validation — uploadStatus must be 'ready', all files must be 'complete'
 *   3. Semantic validation — file-level consistency checks (checksums, error fields, etc.)
 *
 * @see https://eaflood.atlassian.net/wiki/spaces/SFD/pages/6463259966
 */
export const uploadCallback = {
  method: 'POST',
  path: `${baseUrl}/callback`,
  options: {
    description: 'Callback used by the CDP Uploader',
    notes: 'This endpoint is only called by the CDP Uploader service after processing an upload request.',
    auth: false, // This endpoint is called by an external service (CDP Uploader) that does not have authentication capabilities, so auth is disabled for this route.
    tags: ['api', 'cdp-uploader'],
    validate: {
      payload: callbackPayloadSchema,
      options: { abortEarly: false },
      failAction: async (request, h, err) => {
        logger.error(buildCallbackValidationFailureLog(request, err), 'Validation failed')
        await metricsCounter('callback_validation_failures')

        try {
          await persistValidationFailureStatus(request.payload, err)
        } catch (persistError) {
          logger.error(buildCallbackPersistFailureLog(request, persistError), 'Failed to persist status for callback validation failure')
        }

        try {
          await publishAuditEvent({
            correlationid: request.headers[tracingHeader],
            audit: {
              entities: [{ entity: 'document', action: 'failed' }],
              status: 'failure',
              details: { reason: 'payload_validation_failure' }
            }
          })
        } catch (_) {}

        return h.response({ message: 'Validation failure persisted' }).code(httpConstants.HTTP_STATUS_CREATED).takeover()
      }
    },
    response: {
      status: callbackResponseSchema
    },
    handler: async (request, h) => {
      try {
        const validationError = await validateCallbackPayload(request.payload, h)
        if (validationError) {
          return validationError
        }
      } catch (validationErr) {
        logger.error(validationErr, 'Post-Joi validation error')
        return Boom.internal(validationErr)
      }

      try {
        const result = await persistMetadataWithOutbox(request.payload)

        if (result.duplicate) {
          return h.response({
            message: 'Duplicate callback ignored',
            correlationId: result.correlationId
          }).code(httpConstants.HTTP_STATUS_OK)
        }

        return h.response({
          message: 'Metadata created',
          count: result.insertedCount,
          ids: Object.values(result.insertedIds).map(id => id.toString())
        }).code(httpConstants.HTTP_STATUS_CREATED)
      } catch (err) {
        logger.error(err)
        try {
          await publishAuditEvent({
            correlationid: request.headers[tracingHeader],
            audit: {
              entities: [{ entity: 'document', action: 'failed' }],
              status: 'failure',
              details: { reason: err.message || 'processing_error' }
            }
          })
        } catch (_) {}
        return Boom.internal(err)
      }
    }
  }
}
