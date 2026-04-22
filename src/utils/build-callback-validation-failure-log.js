/**
 * Builds the structured log context for a Joi schema validation failure on the callback endpoint.
 * Uses approved ECS event.* and error.* fields only.
 * @param {object} request - Hapi request object
 * @param {Error} err - Joi validation error
 */
export const buildCallbackValidationFailureLog = (request, err) => {
  return {
    event: {
      type: 'callback_validation_failure',
      action: request.method,
      category: request.path,
      outcome: 'failure',
      reference: request.payload?.metadata?.uosr
    },
    error: {
      code: err.statusCode ?? err.code,
      message: err.message,
      stack_trace: err.stack,
      type: err.constructor.name
    }
  }
}
/**
 * Builds the structured log context for a failure to persist validation failure status on the callback endpoint.
 * Uses approved ECS event.* and error.* fields only.
 * @param {object} request - Hapi request object
 * @param {Error} persistError - Error thrown by the persist operation
 */
export const buildCallbackPersistFailureLog = (request, persistError) => ({
  event: {
    type: 'callback_validation_persist_failure',
    action: request.method,
    category: request.path,
    outcome: 'failure',
    reference: request.payload?.metadata?.uosr
  },
  error: {
    code: persistError.statusCode ?? persistError.code,
    message: persistError.message,
    stack_trace: persistError.stack,
    type: persistError.constructor.name
  }
})
