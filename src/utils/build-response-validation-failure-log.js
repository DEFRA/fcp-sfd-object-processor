export const RESPONSE_VALIDATION_FAILED = 'Response validation failed'

/**
 * Converts the Joi error details into a comma separated list of the failing field paths.
 * Only the paths are read. details[].message, details[].context.value and _original all carry
 * values from the response, which may include a CRN, so none of them is used.
 * @param {Error & { details?: Array<{ path: Array<string|number> }> }} err - Joi validation error
 * @returns {string} Failing field paths, for example 'data.0.metadata.crn'
 */
const formatFieldPaths = (err) => (err.details ?? [])
  .map(detail => detail.path.join('.'))
  .join(', ')

/**
 * Builds the structured log context for a response that failed its route's Joi response schema.
 * Uses approved ECS event.* and error.* fields only. The original error is deliberately not passed
 * through under err, because its message and stack can contain the value that failed validation.
 * @param {object} request - Hapi request object
 * @param {Error} err - Joi validation error raised by Hapi's response validation
 */
export const buildResponseValidationFailureLog = (request, err) => ({
  event: {
    type: 'response_validation_failure',
    action: request.method,
    category: request.path,
    outcome: 'failure',
    reason: formatFieldPaths(err)
  },
  error: {
    type: 'ResponseValidationError',
    message: RESPONSE_VALIDATION_FAILED
  }
})
