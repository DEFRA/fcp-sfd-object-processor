// Custom validators for callback file upload semantic checks

const BASE64_STANDARD = /^(?:[A-Za-z0-9+/]+=*)$/
const BASE64_URL_SAFE = /^(?:[A-Za-z0-9-_]+=*)$/

/**
 * Validates that a checksumSha256 value is present and valid base64.
 * @param {string} checksumSha256
 * @returns {{ isValid: boolean, error?: string }}
 */
function validateChecksumFormat (checksumSha256) {
  if (!checksumSha256) {
    return { isValid: false, error: 'checksumSha256 is required' }
  }
  const isValidBase64 = BASE64_STANDARD.test(checksumSha256) || BASE64_URL_SAFE.test(checksumSha256)
  if (!isValidBase64) {
    return { isValid: false, error: 'checksumSha256 must be valid base64' }
  }

  return { isValid: true }
}

/**
 * Validates that an errorMessage is a non-empty string.
 * @param {string} errorMessage
 * @returns {{ isValid: boolean, error?: string }}
 */
function validateErrorMessageFormat (errorMessage) {
  if (typeof errorMessage !== 'string') {
    return { isValid: false, error: 'errorMessage must be a string' }
  }

  if (errorMessage.trim().length === 0) {
    return { isValid: false, error: 'errorMessage cannot be empty' }
  }

  return { isValid: true }
}

/**
 * Validates a file with fileStatus 'complete'.
 * Complete files must have s3Key, s3Bucket, checksumSha256, and positive contentLength.
 * They must NOT have hasError or errorMessage.
 * @param {Object} fileObject
 * @returns {{ isValid: boolean, error?: string }}
 */
function validateCompleteFile (fileObject) {
  if (!fileObject.s3Key) {
    return { isValid: false, error: 's3Key is required for complete files' }
  }

  if (!fileObject.s3Bucket) {
    return { isValid: false, error: 's3Bucket is required for complete files' }
  }

  if (!fileObject.checksumSha256) {
    return { isValid: false, error: 'checksumSha256 is required for complete files' }
  }

  if (!fileObject.contentLength || fileObject.contentLength <= 0) {
    return { isValid: false, error: 'contentLength must be > 0 for complete files' }
  }

  if ('hasError' in fileObject) {
    return { isValid: false, error: 'hasError must not be present for complete files' }
  }

  if ('errorMessage' in fileObject) {
    return { isValid: false, error: 'errorMessage must not be present for complete files' }
  }

  return validateChecksumFormat(fileObject.checksumSha256)
}

/**
 * Validates a file with fileStatus 'rejected'.
 * Rejected files must have hasError=true and a non-empty errorMessage.
 * They must NOT have s3Key, s3Bucket, or checksumSha256.
 * @param {Object} fileObject
 * @returns {{ isValid: boolean, error?: string }}
 */
function validateRejectedFile (fileObject) {
  if (!('hasError' in fileObject)) {
    return { isValid: false, error: 'hasError is required for rejected files' }
  }

  if (fileObject.hasError !== true) {
    return { isValid: false, error: 'hasError must be true for rejected files' }
  }

  if (!('errorMessage' in fileObject)) {
    return { isValid: false, error: 'errorMessage is required for rejected files' }
  }

  const errorMessageCheck = validateErrorMessageFormat(fileObject.errorMessage)
  if (!errorMessageCheck.isValid) {
    return errorMessageCheck
  }

  if ('s3Key' in fileObject) {
    return { isValid: false, error: 's3Key must not be present for rejected files' }
  }

  if ('s3Bucket' in fileObject) {
    return { isValid: false, error: 's3Bucket must not be present for rejected files' }
  }

  if ('checksumSha256' in fileObject) {
    return { isValid: false, error: 'checksumSha256 must not be present for rejected files' }
  }

  return { isValid: true }
}

/**
 * Validates semantic consistency of a file upload object based on its fileStatus.
 * @param {Object} fileObject - A file upload object from the callback form
 * @returns {{ isValid: boolean, error?: string }}
 */
export const validateFileUploadConsistency = (fileObject) => {
  const { fileStatus } = fileObject

  if (!fileStatus) {
    return { isValid: false, error: 'fileStatus is required' }
  }

  if (fileStatus === 'complete') {
    return validateCompleteFile(fileObject)
  }

  if (fileStatus === 'rejected') {
    return validateRejectedFile(fileObject)
  }

  return { isValid: false, error: `fileStatus must be 'complete' or 'rejected' but was '${fileStatus}'` }
}
