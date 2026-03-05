// Custom validators for callback file upload semantic checks

const base64Std = /^(?:[A-Za-z0-9+/]+=*)$/
const base64Url = /^(?:[A-Za-z0-9-_]+=*)$/

const validateChecksumFormat = (checksumSha256) => {
  if (!checksumSha256) return { isValid: false, error: 'checksumSha256 is required' }
  const ok = base64Std.test(checksumSha256) || base64Url.test(checksumSha256)
  return ok ? { isValid: true } : { isValid: false, error: 'checksumSha256 must be valid base64' }
}

const validateErrorMessageFormat = (errorMessage) => {
  if (typeof errorMessage !== 'string') return { isValid: false, error: 'errorMessage must be a string' }
  if (errorMessage.trim().length === 0) return { isValid: false, error: 'errorMessage cannot be empty' }
  return { isValid: true }
}

export const validateFileUploadConsistency = (fileObject) => {
  const { fileStatus } = fileObject
  if (!fileStatus) return { isValid: false, error: 'fileStatus is required' }
  // Accept 'complete' and 'rejected' statuses. 'pending' and unknown statuses are invalid.
  if (fileStatus === 'complete') {
    if (!fileObject.s3Key) return { isValid: false, error: 's3Key is required for complete files' }
    if (!fileObject.s3Bucket) return { isValid: false, error: 's3Bucket is required for complete files' }
    if (!fileObject.checksumSha256) return { isValid: false, error: 'checksumSha256 is required for complete files' }
    if (!fileObject.contentLength || fileObject.contentLength <= 0) return { isValid: false, error: 'contentLength must be > 0 for complete files' }
    if ('hasError' in fileObject) return { isValid: false, error: 'hasError must not be present for complete files' }
    if ('errorMessage' in fileObject) return { isValid: false, error: 'errorMessage must not be present for complete files' }
    const checksumCheck = validateChecksumFormat(fileObject.checksumSha256)
    if (!checksumCheck.isValid) return checksumCheck
    return { isValid: true }
  }

  if (fileStatus === 'rejected') {
    if (!('hasError' in fileObject)) return { isValid: false, error: 'hasError is required for rejected files' }
    if (fileObject.hasError !== true) return { isValid: false, error: 'hasError must be true for rejected files' }
    if (!('errorMessage' in fileObject)) return { isValid: false, error: 'errorMessage is required for rejected files' }
    const emCheck = validateErrorMessageFormat(fileObject.errorMessage)
    if (!emCheck.isValid) return emCheck
    if ('s3Key' in fileObject) return { isValid: false, error: 's3Key must not be present for rejected files' }
    if ('s3Bucket' in fileObject) return { isValid: false, error: 's3Bucket must not be present for rejected files' }
    if ('checksumSha256' in fileObject) return { isValid: false, error: 'checksumSha256 must not be present for rejected files' }
    return { isValid: true }
  }

  // pending or other statuses are not acceptable for callbacks
  return { isValid: false, error: `fileStatus must be 'complete' or 'rejected' but was '${fileStatus}'` }
}
