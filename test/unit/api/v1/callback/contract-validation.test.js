import { describe, test, expect, vi } from 'vitest'

// Module-level config.get calls in file-upload-schema.js and uploader-common.js
// require mocking before import to ensure text/plain is always in the allowed list.
const { mockConfigGet } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    if (key === 'cdpUploaderMimeTypes') {
      return [
        'image/png', 'image/jpeg', 'image/gif', 'image/tiff', 'image/jfif',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel', 'application/vnd.ms-excel.sheet.macroEnabled.12',
        'application/vnd.ms-word.document.macroEnabled.12',
        'application/x-cfb', 'application/vnd.oasis.opendocument.text',
        'text/plain'
      ]
    }
    if (key === 'cdpUploaderDocumentTypes') return ['CS_Agreement_Evidence', 'CS_Application_Evidence']
    return null
  })
}))

vi.mock('../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

const { callbackPayloadSchema } = await import('../../../../../src/api/v1/callback/schema.js')
const { fileUploadSchema } = await import('../../../../../src/api/v1/schemas/file-upload-schema.js')
const { mockScanAndUploadResponse } = await import('../../../../mocks/cdp-uploader.js')

describe('callback contract validation (fileStatus variants)', () => {
  const base = structuredClone(mockScanAndUploadResponse)

  test('REJECTED file with hasError=true and non-empty errorMessage passes validation', () => {
    const payload = { ...base }
    const file = { ...payload.form['a-file-upload-field'], fileStatus: 'rejected', hasError: true, errorMessage: 'File contains virus' }
    // remove fields that are forbidden for rejected files
    delete file.s3Key
    delete file.s3Bucket
    payload.form = { 'rejected-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })

  test('REJECTED file with detectedContentType and checksumSha256 passes validation (CDP Uploader includes them)', () => {
    const payload = { ...base }
    const file = {
      fileId: '550e8400-e29b-41d4-a716-446655440000',
      filename: 'virus.pdf',
      contentType: 'application/pdf',
      detectedContentType: 'application/pdf',
      checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
      contentLength: 10503,
      fileStatus: 'rejected',
      hasError: true,
      errorMessage: 'The selected file contains a virus'
    }
    payload.form = { 'rejected-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })

  test('REJECTED file without errorMessage fails validation', () => {
    const payload = { ...base }
    const file = { ...payload.form['a-file-upload-field'], fileStatus: 'rejected', hasError: true }
    // remove fields that are forbidden for rejected files
    delete file.s3Key
    delete file.s3Bucket
    // remove errorMessage explicitly if present
    delete file.errorMessage
    payload.form = { 'rejected-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeDefined()
    // Expect a validation failure mentioning errorMessage (may be in path or message)
    const hasErrorMessageRef = error.details.some(d =>
      d.path.join('.').includes('errorMessage') ||
      d.message.includes('errorMessage')
    )
    expect(hasErrorMessageRef).toBe(true)
  })

  test('REJECTED file with errorCode passes validation', () => {
    const payload = { ...base }
    const file = { ...payload.form['a-file-upload-field'], fileStatus: 'rejected', hasError: true, errorMessage: 'The selected file must be smaller than 10 MB', errorCode: 'FILE_TOO_LARGE' }
    delete file.s3Key
    delete file.s3Bucket
    payload.form = { 'rejected-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })

  test('REJECTED file with errorCode and errorParams passes validation', () => {
    const payload = { ...base }
    const file = { ...payload.form['a-file-upload-field'], fileStatus: 'rejected', hasError: true, errorMessage: 'The selected file must be smaller than 10 MB', errorCode: 'FILE_TOO_LARGE', errorParams: { maxFileSize: 10000000 } }
    delete file.s3Key
    delete file.s3Bucket
    payload.form = { 'rejected-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })

  test('REJECTED file without errorCode/errorParams still passes validation (backwards compatible)', () => {
    const payload = { ...base }
    const file = { ...payload.form['a-file-upload-field'], fileStatus: 'rejected', hasError: true, errorMessage: 'File contains virus' }
    delete file.s3Key
    delete file.s3Bucket
    payload.form = { 'rejected-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })

  test('REJECTED file with non-object errorParams fails validation', () => {
    const payload = { ...base }
    const file = { ...payload.form['a-file-upload-field'], fileStatus: 'rejected', hasError: true, errorMessage: 'The selected file must be smaller than 10 MB', errorCode: 'FILE_TOO_LARGE', errorParams: 'not-an-object' }
    delete file.s3Key
    delete file.s3Bucket
    payload.form = { 'rejected-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeDefined()
    expect(error.details.some(d => d.path.join('.').includes('errorParams'))).toBe(true)
  })

  test('COMPLETE text/plain file with no detectedContentType passes validation (CDP Uploader cannot detect MIME type from magic bytes for plain text)', () => {
    const payload = { ...base }
    const file = {
      fileId: '550e8400-e29b-41d4-a716-446655440000',
      filename: 'notes.txt',
      contentType: 'text/plain',
      fileStatus: 'complete',
      s3Key: 'uploads/notes.txt',
      s3Bucket: 'test-bucket',
      checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
      contentLength: 42
    }
    payload.form = { 'text-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })

  test('COMPLETE file with an invalid detectedContentType still fails validation (allowedMimeTypes constraint preserved)', () => {
    const payload = { ...base }
    const file = {
      fileId: '550e8400-e29b-41d4-a716-446655440000',
      filename: 'notes.txt',
      contentType: 'text/plain',
      detectedContentType: 'application/x-malicious',
      fileStatus: 'complete',
      s3Key: 'uploads/notes.txt',
      s3Bucket: 'test-bucket',
      checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
      contentLength: 42
    }
    payload.form = { 'text-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeDefined()
    expect(error.details.some(d => d.path.join('.').includes('detectedContentType') && d.type === 'any.only')).toBe(true)
  })

  test('PENDING file with minimal fields passes validation', () => {
    const payload = { ...base }
    const minimalFile = {
      fileId: '550e8400-e29b-41d4-a716-446655440000',
      filename: 'maybe.pdf',
      contentType: 'application/pdf',
      detectedContentType: 'application/pdf',
      fileStatus: 'pending'
    }
    payload.form = { 'pending-file': minimalFile }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })

  test('COMPLETE file missing s3Key fails validation', () => {
    const payload = { ...base }
    const file = { ...payload.form['a-file-upload-field'], fileStatus: 'complete' }
    delete file.s3Key
    payload.form = { 'complete-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeDefined()
    expect(error.details.some(d => d.path.join('.').includes('s3Key'))).toBe(true)
  })

  test('Invalid fileStatus enum returns validation error', () => {
    const payload = { ...base }
    const file = { ...payload.form['a-file-upload-field'], fileStatus: 'invalid-status' }
    payload.form = { 'bad-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeDefined()
    expect(error.details.some(d => d.path.join('.').includes('fileStatus') && d.type === 'any.only')).toBe(true)
  })

  test('pure grouped form (all files in array, no separate field names) passes schema validation', () => {
    const payload = { ...base }
    payload.form = {
      documents: [
        payload.form['a-file-upload-field'],
        payload.form['another-file-upload-field']
      ]
    }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })

  test('mixed string field and grouped file array passes schema validation', () => {
    const payload = { ...base }
    payload.form = {
      'text-field': 'some text value',
      documents: [payload.form['a-file-upload-field']]
    }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })

  test('grouped array containing a REJECTED file passes Joi schema (Stage 2 validation rejects it, not schema)', () => {
    const payload = { ...base }
    const rejectedFile = {
      fileId: '550e8400-e29b-41d4-a716-446655440000',
      filename: 'virus.pdf',
      contentType: 'application/pdf',
      detectedContentType: 'application/pdf',
      fileStatus: 'rejected',
      hasError: true,
      errorMessage: 'The selected file contains a virus'
    }
    payload.form = {
      documents: [
        payload.form['a-file-upload-field'],
        rejectedFile
      ]
    }
    payload.numberOfRejectedFiles = 1

    // Schema permits mixed complete+rejected in a grouped array;
    // validateCallbackPayload (Stage 2) is responsible for rejecting this payload.
    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })
})

describe('fileUploadSchema Joi edge cases', () => {
  test('should reject complete file with empty string s3Key', () => {
    const file = {
      fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      filename: 'test.pdf',
      contentType: 'application/pdf',
      detectedContentType: 'application/pdf',
      fileStatus: 'complete',
      s3Key: '',
      s3Bucket: 'bucket',
      checksumSha256: 'abc=',
      contentLength: 1024
    }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeDefined()
  })

  test('should reject complete file with contentLength 0', () => {
    const file = {
      fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      filename: 'test.pdf',
      contentType: 'application/pdf',
      detectedContentType: 'application/pdf',
      fileStatus: 'complete',
      s3Key: 'key',
      s3Bucket: 'bucket',
      checksumSha256: 'abc=',
      contentLength: 0
    }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeDefined()
  })

  test('should reject rejected file with empty errorMessage', () => {
    const file = {
      fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      filename: 'test.pdf',
      contentType: 'application/pdf',
      fileStatus: 'rejected',
      hasError: true,
      errorMessage: ''
    }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeDefined()
  })

  test('should reject rejected file with hasError=false', () => {
    const file = {
      fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      filename: 'test.pdf',
      contentType: 'application/pdf',
      fileStatus: 'rejected',
      hasError: false,
      errorMessage: 'error'
    }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeDefined()
  })

  test('should reject complete file with hasError field present', () => {
    const file = {
      fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      filename: 'test.pdf',
      contentType: 'application/pdf',
      detectedContentType: 'application/pdf',
      fileStatus: 'complete',
      s3Key: 'key',
      s3Bucket: 'bucket',
      checksumSha256: 'abc=',
      contentLength: 1024,
      hasError: false
    }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeDefined()
  })

  test('should reject COMPLETE file with errorCode present', () => {
    const file = {
      fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      filename: 'test.pdf',
      contentType: 'application/pdf',
      detectedContentType: 'application/pdf',
      fileStatus: 'complete',
      s3Key: 'key',
      s3Bucket: 'bucket',
      checksumSha256: 'abc=',
      contentLength: 1024,
      errorCode: 'FILE_TOO_LARGE'
    }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeDefined()
  })

  test('should reject COMPLETE file with errorParams present', () => {
    const file = {
      fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      filename: 'test.pdf',
      contentType: 'application/pdf',
      detectedContentType: 'application/pdf',
      fileStatus: 'complete',
      s3Key: 'key',
      s3Bucket: 'bucket',
      checksumSha256: 'abc=',
      contentLength: 1024,
      errorParams: { maxFileSize: 10000000 }
    }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeDefined()
  })
})

describe('All 12 allowed MIME types should pass validation', () => {
  const baseFile = {
    fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
    filename: 'test.file',
    fileStatus: 'complete',
    s3Key: 'key',
    s3Bucket: 'bucket',
    checksumSha256: 'abc=',
    contentLength: 1024
  }

  test('image/png passes validation', () => {
    const file = { ...baseFile, contentType: 'image/png', detectedContentType: 'image/png' }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('image/jpeg passes validation', () => {
    const file = { ...baseFile, contentType: 'image/jpeg', detectedContentType: 'image/jpeg' }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('image/gif passes validation', () => {
    const file = { ...baseFile, contentType: 'image/gif', detectedContentType: 'image/gif' }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('image/tiff passes validation', () => {
    const file = { ...baseFile, contentType: 'image/tiff', detectedContentType: 'image/tiff' }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('application/pdf passes validation', () => {
    const file = { ...baseFile, contentType: 'application/pdf', detectedContentType: 'application/pdf' }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('application/msword passes validation', () => {
    const file = { ...baseFile, contentType: 'application/msword', detectedContentType: 'application/msword' }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('application/vnd.openxmlformats-officedocument.wordprocessingml.document passes validation', () => {
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const file = { ...baseFile, contentType: mime, detectedContentType: mime }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('application/vnd.ms-word.document.macroEnabled.12 passes validation', () => {
    const mime = 'application/vnd.ms-word.document.macroEnabled.12'
    const file = { ...baseFile, contentType: mime, detectedContentType: mime }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('application/vnd.ms-excel passes validation', () => {
    const file = { ...baseFile, contentType: 'application/vnd.ms-excel', detectedContentType: 'application/vnd.ms-excel' }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet passes validation', () => {
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const file = { ...baseFile, contentType: mime, detectedContentType: mime }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('application/vnd.ms-excel.sheet.macroEnabled.12 passes validation', () => {
    const mime = 'application/vnd.ms-excel.sheet.macroEnabled.12'
    const file = { ...baseFile, contentType: mime, detectedContentType: mime }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })

  test('application/vnd.openxmlformats-officedocument.presentationml.presentation passes validation', () => {
    const mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    const file = { ...baseFile, contentType: mime, detectedContentType: mime }
    const result = fileUploadSchema.validate(file)
    expect(result.error).toBeUndefined()
  })
})
