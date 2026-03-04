import Boom from '@hapi/boom'

import { constants as httpConstants } from 'node:http2'
import { createLogger } from '../../../logging/logger.js'
import { callbackPayloadSchema, callbackResponseSchema } from './schema.js'
import { config } from '../../../config/index.js'
import { persistMetadataWithOutbox, persistValidationFailureStatus } from '../../../services/metadata-service.js'
import { metricsCounter } from '../../common/helpers/metrics.js'
import {
  validateScanResultConsistency,
  validateRejectionReasonAlignment,
  validateFileCountConsistency
} from './validators.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')

/**
 * Validate scan results for a single file upload
 *
 * @param {object} fileValue - File upload object from form
 * @param {number} totalFileCount - Total files in form
 * @returns {string[]} Array of validation errors (empty if valid)
 */
const validateFileScanResults = (fileValue, totalFileCount) => {
  const errors = []

  // Only validate if scan fields are present (optional during transition)
  if (!fileValue.scanStatus) {
    return errors
  }

  // Validate virusResult alignment
  const virusResultValidation = validateScanResultConsistency(
    fileValue.scanStatus,
    fileValue.virusResult
  )
  if (!virusResultValidation.isValid) {
    errors.push(virusResultValidation.error)
  }

  // Validate rejectionReason alignment
  const rejectionReasonValidation = validateRejectionReasonAlignment(
    fileValue.scanStatus,
    fileValue.rejectionReason
  )
  if (!rejectionReasonValidation.isValid) {
    errors.push(rejectionReasonValidation.error)
  }

  // Validate file count consistency
  const fileCountValidation = validateFileCountConsistency(
    fileValue.scanStatus,
    fileValue.numberOfRejectedFiles,
    totalFileCount
  )
  if (!fileCountValidation.isValid) {
    errors.push(fileCountValidation.error)
  }

  return errors
}

/**
 * Run scan result validation on all files in payload
 *
 * @param {object} payload - Callback payload
 * @returns {string[]} Array of all validation errors (empty if valid)
 */
const validatePayloadScanResults = (payload) => {
  const allErrors = []

  // Get total file count
  const totalFileCount = Object.values(payload.form).filter(
    v => typeof v === 'object' && v !== null && v.fileId
  ).length

  // Validate each file in form
  Object.entries(payload.form).forEach(([_fieldName, fieldValue]) => {
    // Only validate file upload objects (skip string form fields)
    if (typeof fieldValue === 'object' && fieldValue !== null && fieldValue.fileId) {
      const fileErrors = validateFileScanResults(fieldValue, totalFileCount)
      allErrors.push(...fileErrors)
    }
  })

  return allErrors
}

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
      failAction: async (request, _h, err) => {
        logger.error({ error: { message: err.message } }, 'Validation failed')
        await metricsCounter('callback_validation_failures')

        try {
          await persistValidationFailureStatus(request.payload, err)
        } catch (persistError) {
          logger.error(persistError, 'Failed to persist status for callback validation failure')
        }

        throw Boom.boomify(err, { statusCode: httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY })
      }
    },
    response: {
      status: callbackResponseSchema
    },
    handler: async (request, h) => {
      try {
        const payload = request.payload

        // Validate scan result contract for all files
        const scanValidationErrors = validatePayloadScanResults(payload)

        // If scan validation failed, persist status record and return error
        if (scanValidationErrors.length > 0) {
          logger.warn({ errors: scanValidationErrors }, 'Scan result contract validation failed')
          await metricsCounter('callback_scan_validation_failures')

          try {
            await persistValidationFailureStatus(payload, {
              message: scanValidationErrors.join('; '),
              scanValidationErrors: true
            })
          } catch (persistError) {
            logger.error(persistError, 'Failed to persist status for scan validation failure')
          }

          throw Boom.boomify(
            { message: scanValidationErrors.join('; ') },
            { statusCode: httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY }
          )
        }

        // All validations passed - persist metadata with outbox
        const result = await persistMetadataWithOutbox(payload)

        return h.response({
          message: 'Metadata created',
          count: result.insertedCount,
          ids: Object.values(result.insertedIds).map(id => id.toString())
        }).code(httpConstants.HTTP_STATUS_CREATED)
      } catch (err) {
        logger.error(err)
        return Boom.internal(err)
      }
    }
  }
}
