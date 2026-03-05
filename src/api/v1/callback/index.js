import Boom from '@hapi/boom'

import { constants as httpConstants } from 'node:http2'
import { createLogger } from '../../../logging/logger.js'
import { callbackPayloadSchema, callbackResponseSchema } from './schema.js'
import { validateFileUploadConsistency } from './validate-file-upload-consistency.js'
import { config } from '../../../config/index.js'
import { persistMetadataWithOutbox, persistValidationFailureStatus } from '../../../services/metadata-service.js'
import { metricsCounter } from '../../common/helpers/metrics.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')

/**
 * Validates file uploads in the form data for semantic consistency
 * @param {Object} form - The form object containing file uploads
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
async function validateFormFiles (form) {
  if (!form || typeof form !== 'object') {
    return { isValid: true }
  }

  for (const [, val] of Object.entries(form)) {
    if (val && typeof val === 'object' && 'fileId' in val) {
      const check = validateFileUploadConsistency(val)
      if (!check.isValid) {
        return { isValid: false, error: check.error, file: val }
      }
    }
  }

  return { isValid: true }
}

/**
 * Handles semantic validation failures by persisting status and logging
 * @param {Object} payload - The request payload
 * @param {Error} error - The validation error
 * @param {Object} file - The file that failed validation (optional)
 * @returns {Promise<Object>} Boom error response
 */
async function handleValidationFailure (payload, error, file, h) {
  try {
    await persistValidationFailureStatus(payload, error)
  } catch (persistErr) {
    logger.error(persistErr, 'Failed to persist status for semantic validation failure')
  }

  if (file?.fileId) {
    logger.error({ file: { id: file.fileId, fileStatus: file.fileStatus, error: error.message } }, 'File upload contract validation failed')
  }

  // Return success response while persisting the validation failure for audit
  if (h && typeof h.response === 'function') {
    return h.response({ message: 'Validation failure persisted' }).code(httpConstants.HTTP_STATUS_CREATED)
  }

  // Fallback: return a minimal success-like object
  return { status: httpConstants.HTTP_STATUS_CREATED, body: { message: 'Validation failure persisted' } }
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
      failAction: async (request, h, err) => {
        logger.error({ error: { message: err.message } }, 'Validation failed')
        await metricsCounter('callback_validation_failures')

        try {
          await persistValidationFailureStatus(request.payload, err)
        } catch (persistError) {
          logger.error(persistError, 'Failed to persist status for callback validation failure')
        }

        // Return success response while persisting the validation failure for audit
        return h.response({ message: 'Validation failure persisted' }).code(httpConstants.HTTP_STATUS_CREATED)
      }
    },
    response: {
      status: callbackResponseSchema
    },
    handler: async (request, h) => {
      // Enforce contract: callbacks must be final-ready and files must be complete.
      try {
        const payload = request.payload || {}

        // Check uploadStatus === 'ready'
        if (payload.uploadStatus !== 'ready') {
          await metricsCounter('callback_unexpected_status')
          return await handleValidationFailure(payload, new Error(`uploadStatus must be 'ready' but was '${payload.uploadStatus}'`), undefined, h)
        }

        // Check every file in the form is fileStatus === 'complete'
        const form = payload.form || {}
        for (const [, val] of Object.entries(form)) {
          if (val && typeof val === 'object' && 'fileId' in val) {
            if (val.fileStatus !== 'complete') {
              await metricsCounter('callback_unexpected_status')
              return await handleValidationFailure(payload, new Error(`fileStatus must be 'complete' but was '${val.fileStatus}'`), val, h)
            }
          }
        }

        // Post-Joi semantic validation for each file upload
        const validation = await validateFormFiles(form)
        if (!validation.isValid) {
          return await handleValidationFailure(payload, new Error(validation.error), validation.file, h)
        }
      } catch (validationErr) {
        logger.error(validationErr, 'Post-Joi validation error')
        return Boom.internal(validationErr)
      }

      try {
        const result = await persistMetadataWithOutbox(request.payload)

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
