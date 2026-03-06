import { constants as httpConstants } from 'node:http2'
import { createLogger } from '../../../../logging/logger.js'
import { persistValidationFailureStatus } from '../../../../services/metadata-service.js'

const logger = createLogger()

/**
 * Handles semantic validation failures by persisting an audit record and
 * returning a 201 response (validation failures are persisted, not rejected).
 *
 * @param {Object} payload - The original request payload
 * @param {Error} error - The validation error
 * @param {Object|undefined} file - The file that failed validation (optional)
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Hapi response with 201 status
 */
export async function handleValidationFailure (payload, error, file, h) {
  try {
    await persistValidationFailureStatus(payload, error)
  } catch (persistErr) {
    logger.error(persistErr, 'Failed to persist status for semantic validation failure')
  }

  if (file && file.fileId) {
    logger.error(
      { file: { id: file.fileId, fileStatus: file.fileStatus, error: error.message } },
      'File upload contract validation failed'
    )
  }

  if (h && typeof h.response === 'function') {
    return h.response({ message: 'Validation failure persisted' }).code(httpConstants.HTTP_STATUS_CREATED)
  }

  return { status: httpConstants.HTTP_STATUS_CREATED, body: { message: 'Validation failure persisted' } }
}
