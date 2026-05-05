import { describe, test, expect } from 'vitest'
import { callbackPayloadSchema } from '../../../../../src/api/v1/callback/schema.js'
import { fileUploadSchema } from '../../../../../src/api/v1/schemas/file-upload-schema.js'
import { mockScanAndUploadResponse } from '../../../../mocks/cdp-uploader.js'

describe('callback contract validation (fileStatus variants)', () => {
  const base = structuredClone(mockScanAndUploadResponse)

  test('REJECTED file with hasError=true and non-empty errorMessage passes validation', () => {
    const payload = { ...base }
    const file = { ...payload.form['a-file-upload-field'], fileStatus: 'rejected', hasError: true, errorMessage: 'File contains virus' }
    // remove fields that are forbidden for rejected files
    delete file.s3Key
    delete file.s3Bucket
    delete file.checksumSha256
    delete file.detectedContentType
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
    delete file.checksumSha256
    delete file.detectedContentType
    // remove errorMessage explicitly if present
    delete file.errorMessage
    payload.form = { 'rejected-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeDefined()
    // Expect a validation failure related to errorMessage
    expect(error.details.some(d => d.path.join('.').includes('errorMessage'))).toBe(true)
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
