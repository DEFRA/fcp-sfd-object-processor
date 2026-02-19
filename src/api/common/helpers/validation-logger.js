/**
 * Sanitizes a validation error value for logging
 * - Truncates strings longer than 100 characters
 * - Redacts sensitive fields (metadata.reference, metadata.files)
 * - Returns original value for non-sensitive, short values
 *
 * @param {string} fieldPath - The full field path (e.g., 'metadata.reference')
 * @param {*} value - The value to sanitize
 * @returns {*} The sanitized value
 */
const sanitizeValue = (fieldPath, value) => {
  // Redact sensitive fields that may contain PII
  if (fieldPath === 'metadata.reference' || fieldPath === 'metadata.files') {
    return '[REDACTED]'
  }

  // Truncate long strings
  if (typeof value === 'string' && value.length > 100) {
    return value.substring(0, 100)
  }

  return value
}

/**
 * Converts Joi error details path array to dot-notation string
 * Example: ['metadata', 'sbi'] -> 'metadata.sbi'
 *
 * @param {Array} pathArray - Array of path segments from Joi error
 * @returns {string} Dot-notated field path
 */
const formatFieldPath = (pathArray) => {
  return pathArray.join('.')
}

/**
 * Logs validation failure with structured error information
 * Extracts field-level errors from Joi validation error and logs them
 * with sanitized values to prevent PII exposure
 *
 * @param {object} logger - Pino logger instance
 * @param {object} err - Joi ValidationError with details array
 * @param {object} request - Hapi request object with path and method
 */
export const logValidationFailure = (logger, err, request) => {
  const validationErrors = err.details.map((detail) => {
    const field = formatFieldPath(detail.path)

    return {
      field,
      type: detail.type,
      value: sanitizeValue(field, detail.context?.value),
      message: detail.message
    }
  })

  logger.error({
    validationErrors,
    path: request.path,
    method: request.method
  }, 'Validation failed')
}
