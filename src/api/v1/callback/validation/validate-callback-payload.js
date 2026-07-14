import { createLogger } from '../../../../logging/logger.js'
import { metricsCounter } from '../../../common/helpers/metrics.js'
import { validateFormFiles } from './validate-form-files.js'
import { handleValidationFailure } from './handle-validation-failure.js'
import { flattenFormFiles } from '../../../../utils/flatten-form-files.js'

const logger = createLogger()

const isFileEntry = (val) =>
  val !== null && typeof val === 'object' && 'fileId' in val

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

  // Stage 1: Contract validation — uploadStatus must be 'ready'
  if (requestPayload.uploadStatus !== 'ready') {
    await metricsCounter('callback_unexpected_status')
    return handleValidationFailure(requestPayload, new Error(`uploadStatus must be 'ready' but was '${requestPayload.uploadStatus}'`), undefined, h)
  }

  // Observability: numberOfRejectedFiles mismatch check (lenient — warn only)
  const form = requestPayload.form || {}
  const actualRejectedCount = flattenFormFiles(form).filter(
    fileVal => fileVal && typeof fileVal === 'object' && 'fileId' in fileVal && fileVal.fileStatus === 'rejected'
  ).length
  const declaredRejectedCount = requestPayload.numberOfRejectedFiles

  if (declaredRejectedCount !== actualRejectedCount) {
    logger.warn(
      {
        event: {
          type: 'rejected_files_count_mismatch',
          action: 'callback_validation',
          category: 'observability',
          outcome: 'mismatch',
          reference: requestPayload.metadata?.uosr,
          expected: declaredRejectedCount,
          actual: actualRejectedCount
        }
      },
      `numberOfRejectedFiles mismatch: declared=${declaredRejectedCount}, actual=${actualRejectedCount}`
    )
    await metricsCounter('op.callback.rejected_files_mismatch')
  }

  // Stage 2: Contract validation — every file in the form must have fileStatus 'complete'
  for (const fileVal of flattenFormFiles(form)) {
    if (isFileEntry(fileVal) && fileVal.fileStatus !== 'complete') {
      await metricsCounter('callback_unexpected_status')
      return handleValidationFailure(requestPayload, new Error(`fileStatus must be 'complete' but was '${fileVal.fileStatus}'`), fileVal, h)
    }
  }

  // Stage 3: Post-Joi semantic validation for each file upload
  const validation = validateFormFiles(form)
  if (!validation.isValid) {
    return handleValidationFailure(requestPayload, new Error(validation.error), validation.file, h)
  }

  return null
}
