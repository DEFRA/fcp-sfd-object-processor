import Boom from '@hapi/boom'

import { constants as httpConstants } from 'node:http2'
import { createLogger } from '../../../logging/logger.js'
import { callbackPayloadSchema, callbackResponseSchema } from './schema.js'
import { config } from '../../../config/index.js'
import { persistMetadataWithOutbox, persistValidationFailureStatus } from '../../../services/metadata-service.js'
import { metricsCounter } from '../../common/helpers/metrics.js'
import { validateCallbackPayload } from './validation/validate-callback-payload.js'
import { buildCallbackValidationFailureLog, buildCallbackPersistFailureLog } from '../../../utils/build-callback-validation-failure-log.js'
import { buildAuditAccounts } from '../../../utils/build-audit-accounts.js'
import { sendAuditEvent } from '../../../messaging/outbound/audit/send-audit-event.js'
import { extractFileIdsFromPayload } from '../../../mappers/status.js'
import { splitJourneyId } from '../../../utils/split-journey-id.js'
import { resolveJourneyId } from '../../../services/journey-correlation-service.js'
import { runWithCorrelationId } from '../../../logging/correlation-id-store.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')

// Takes the journey id out of the caller-supplied metadata and verifies it against the
// session written at initiate. Returns the correlation id for this upload together with
// a payload whose metadata no longer carries the id, so that nothing downstream has to
// remember to strip it. Never throws: an unresolved id degrades to a generated one.
const resolveCallbackCorrelation = async (payload) => {
  const { journeyId: rawJourneyId, metadata } = splitJourneyId(payload?.metadata)
  const { journeyId } = await resolveJourneyId(rawJourneyId, metadata)

  return { correlationId: journeyId, payload: { ...payload, metadata } }
}

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
        // Resolved before anything is logged, so that every line below carries the id.
        const { correlationId, payload } = await resolveCallbackCorrelation(request.payload)

        return runWithCorrelationId(correlationId, async () => {
          logger.error(buildCallbackValidationFailureLog(request, err, correlationId), 'Validation failed')
          await metricsCounter('callback_validation_failures')

          try {
            await persistValidationFailureStatus(payload, err, correlationId)
          } catch (persistError) {
            logger.error(buildCallbackPersistFailureLog(request, persistError, correlationId), 'Failed to persist status for callback validation failure')
          }

          const failedFileIds = extractFileIdsFromPayload(request.payload)
          // Promise.allSettled fires audit events concurrently and never rejects,
          // so a broker/network failure can't turn this into a 500 or block the response.
          await Promise.allSettled(failedFileIds.map(fileId => sendAuditEvent({
            correlationid: correlationId,
            audit: {
              entities: [{ entity: 'document', action: 'failed', entityid: fileId }],
              ...buildAuditAccounts(request.payload?.metadata?.sbi),
              status: 'failure',
              details: { reason: 'payload_validation_failure' }
            }
          }, request)))

          return h.response({ message: 'Validation failure persisted' }).code(httpConstants.HTTP_STATUS_CREATED).takeover()
        })
      }
    },
    response: {
      status: callbackResponseSchema
    },
    handler: async (request, h) => {
      const { correlationId, payload } = await resolveCallbackCorrelation(request.payload)

      return runWithCorrelationId(correlationId, async () => {
        try {
          const validationError = await validateCallbackPayload(payload, h, correlationId)
          if (validationError) {
            return validationError
          }
        } catch (validationErr) {
          logger.error(validationErr, 'Post-Joi validation error')
          return Boom.internal(validationErr)
        }

        try {
          const result = await persistMetadataWithOutbox(payload, correlationId)

          if (result.duplicate) {
            return h.response({
              message: 'Duplicate callback ignored'
            }).code(httpConstants.HTTP_STATUS_OK)
          }

          const fileIds = Object.values(result.insertedIds).map(id => id.toString())

          await Promise.allSettled(fileIds.map(fileId => sendAuditEvent({
            correlationid: correlationId,
            audit: {
              entities: [{ entity: 'document', action: 'created', entityid: fileId }],
              ...buildAuditAccounts(request.payload?.metadata?.sbi),
              status: 'success',
              details: { reason: 'callback_successful' }
            }
          }, request)))

          return h.response({
            message: 'Metadata created',
            count: result.insertedCount,
            ids: fileIds
          }).code(httpConstants.HTTP_STATUS_CREATED)
        } catch (err) {
          logger.error(err)

          const errorFileIds = extractFileIdsFromPayload(request.payload)
          await Promise.allSettled(errorFileIds.map(fileId => sendAuditEvent({
            correlationid: correlationId,
            audit: {
              entities: [{ entity: 'document', action: 'failed', entityid: fileId }],
              ...buildAuditAccounts(request.payload?.metadata?.sbi),
              status: 'failure',
              details: { reason: 'callback_processing_failure' }
            }
          }, request)))

          return Boom.internal(err)
        }
      })
    }
  }
}
