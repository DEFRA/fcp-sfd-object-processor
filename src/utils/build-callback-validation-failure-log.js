import { extractFileIdsFromPayload } from '../mappers/status.js'

/**
 * Builds the structured log context for a Joi schema validation failure on the callback endpoint.
 * Uses CDP's approved cdp-uploader.*, event.* and error.* fields.
 * @param {object} request - Hapi request object
 * @param {Error} err - Joi validation error
 * @param {string} journeyId - Resolved journey correlation id for this callback (no PII)
 */
export const buildCallbackValidationFailureLog = (request, err, journeyId) => {
  return {
    'cdp-uploader': {
      fileIds: extractFileIdsFromPayload(request.payload)
    },
    event: {
      type: 'callback_validation_failure',
      action: request.method,
      category: request.path,
      outcome: 'failure',
      reference: journeyId
    },
    error: {
      code: err.statusCode ?? err.code ?? null,
      message: err.message,
      stack_trace: err.stack,
      type: err?.constructor?.name || err?.name || 'Error'
    }
  }
}
/**
 * Builds the structured log context for a failure to persist validation failure status on the callback endpoint.
 * Uses approved ECS event.* and error.* fields only.
 * @param {object} request - Hapi request object
 * @param {Error} persistError - Error thrown by the persist operation
 * @param {string} journeyId - Resolved journey correlation id for this callback (no PII)
 */
export const buildCallbackPersistFailureLog = (request, persistError, journeyId) => ({
  event: {
    type: 'callback_validation_persist_failure',
    action: request.method,
    category: request.path,
    outcome: 'failure',
    reference: journeyId
  },
  error: {
    code: persistError.statusCode ?? persistError.code ?? null,
    message: persistError.message,
    stack_trace: persistError.stack,
    type: persistError?.constructor?.name || persistError?.name || 'Error'
  }
})
