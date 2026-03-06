import { metricsCounter } from '../../../common/helpers/metrics.js'
import { validateFormFiles } from './validate-form-files.js'
import { handleValidationFailure } from './handle-validation-failure.js'

/**
 * Validates the callback payload and form files.
 *
 * Performs three stages of validation:
 *   1. Contract validation — uploadStatus must be 'ready'
 *   2. Contract validation — all files must have fileStatus 'complete'
 *   3. Semantic validation — file-level consistency checks
 *
 * @param {Object} payload - The request payload
 * @param {Object} h - Hapi response toolkit
 * @returns {Object|null} - Returns error response if validation fails, null if successful
 */
export async function validateCallbackPayload (payload, h) {
  const requestPayload = payload || {}

  // Stage 2: Contract validation — uploadStatus must be 'ready'
  if (requestPayload.uploadStatus !== 'ready') {
    await metricsCounter('callback_unexpected_status')
    return await handleValidationFailure(requestPayload, new Error(`uploadStatus must be 'ready' but was '${requestPayload.uploadStatus}'`), undefined, h)
  }

  // Stage 2 (continued): Every file in the form must have fileStatus 'complete'
  const form = requestPayload.form || {}
  for (const [, val] of Object.entries(form)) {
    if (val && typeof val === 'object' && 'fileId' in val && val.fileStatus !== 'complete') {
      await metricsCounter('callback_unexpected_status')
      return await handleValidationFailure(requestPayload, new Error(`fileStatus must be 'complete' but was '${val.fileStatus}'`), val, h)
    }
  }

  // Stage 3: Post-Joi semantic validation for each file upload
  const validation = await validateFormFiles(form)
  if (!validation.isValid) {
    return await handleValidationFailure(requestPayload, new Error(validation.error), validation.file, h)
  }

  return null
}
