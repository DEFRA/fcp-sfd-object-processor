/**
 * Custom convict format validator for AWS Cognito client IDs.
 * Validates and coerces comma-separated Cognito app client IDs.
 * Client IDs are typically 26-character alphanumeric strings.
 */

// Cognito client IDs are alphanumeric strings, typically 26 characters
// Example: 1234567890abcdefghijklmnop
const cognitoClientIdPattern = /^[a-zA-Z0-9]+$/

/**
 * Validates a value as a Cognito client ID or array of client IDs
 * @param {string|string[]|null} val - The value to validate
 * @throws {Error} If validation fails
 */
function validate (val) {
  // Allow null or empty string
  if (val === null || val === '') {
    return
  }

  // Allow empty array
  if (Array.isArray(val) && val.length === 0) {
    return
  }

  // Convert to array for validation
  const clientIds = Array.isArray(val) ? val : val.split(',')

  // Validate each client ID
  for (const clientId of clientIds) {
    if (typeof clientId !== 'string' || !cognitoClientIdPattern.test(clientId)) {
      throw new Error('Must be a comma separated list of valid Cognito client IDs (alphanumeric)')
    }
  }
}

/**
 * Coerces a value to an array of Cognito client IDs
 * @param {string|string[]|null} val - The value to coerce
 * @returns {string[]} Array of client IDs
 */
function coerce (val) {
  // Return empty array for null or empty string
  if (val === null || val === '') {
    return []
  }

  // Return array as-is if already an array
  if (Array.isArray(val)) {
    return val
  }

  // Split comma-separated string into array
  return val.split(',')
}

export const cognitoClientIdArray = {
  name: 'cognito-client-id-array',
  validate,
  coerce
}
