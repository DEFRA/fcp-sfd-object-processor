import { describe, test, expect } from 'vitest'
import { callbackPayloadSchema } from '../../../../src/api/v1/callback/schema.js'
import { mockScanAndUploadResponse } from '../../../mocks/cdp-uploader.js'

describe('callbackPayloadSchema validation', () => {
  // Use mock data from CDP uploader as baseline for valid payloads
  const validPayload = mockScanAndUploadResponse

  describe('Top-level payload validation', () => {
    test('valid complete payload passes validation', () => {
      const { error } = callbackPayloadSchema.validate(validPayload)
      expect(error).toBeUndefined()
    })

    test('missing uploadStatus fails validation', () => {
      const { uploadStatus, ...payload } = validPayload
      const { error } = callbackPayloadSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['uploadStatus'])
      expect(error.details[0].type).toBe('any.required')
    })

    test('uploadStatus "ready" passes validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        uploadStatus: 'ready'
      })
      expect(error).toBeUndefined()
    })

    test('uploadStatus "initiated" passes validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        uploadStatus: 'initiated'
      })
      expect(error).toBeUndefined()
    })

    test('uploadStatus "pending" passes validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        uploadStatus: 'pending'
      })
      expect(error).toBeUndefined()
    })

    test('invalid uploadStatus enum fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        uploadStatus: 'invalid-status'
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['uploadStatus'])
      expect(error.details[0].type).toBe('any.only')
    })

    test('missing metadata fails validation', () => {
      const { metadata, ...payload } = validPayload
      const { error } = callbackPayloadSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata'])
    })

    test('missing form fails validation', () => {
      const { form, ...payload } = validPayload
      const { error } = callbackPayloadSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['form'])
    })

    test('negative numberOfRejectedFiles fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        numberOfRejectedFiles: -1
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['numberOfRejectedFiles'])
    })

    test('non-integer numberOfRejectedFiles fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        numberOfRejectedFiles: 3.14
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['numberOfRejectedFiles'])
    })

    test('unknown top-level field fails strict validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        extraField: 'not allowed'
      })
      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('object.unknown')
    })
  })

  describe('Metadata validation', () => {
    test('missing sbi fails validation', () => {
      const { sbi, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('sbi'))).toBe(true)
    })

    test('invalid sbi type (string) fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, sbi: 'abc123456' }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('sbi') && d.type === 'number.base')).toBe(true)
    })

    test('invalid sbi length (too short) fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, sbi: 12345 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('sbi') && d.type === 'number.min')).toBe(true)
    })

    test('invalid sbi length (too long) fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, sbi: 1234567890 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('sbi') && d.type === 'number.max')).toBe(true)
    })

    test('non-integer sbi fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, sbi: 105000000.5 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('sbi') && d.type === 'number.integer')).toBe(true)
    })

    test('missing crn fails validation', () => {
      const { crn, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('crn'))).toBe(true)
    })

    test('invalid crn type (string) fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, crn: 'abc1234567' }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('crn') && d.type === 'number.base')).toBe(true)
    })

    test('invalid crn length (too short) fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, crn: 123 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('crn') && d.type === 'number.min')).toBe(true)
    })

    test('invalid crn length (too long) fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, crn: 12345678901 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('crn') && d.type === 'number.max')).toBe(true)
    })

    test('non-integer crn fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, crn: 1050000000.5 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('crn') && d.type === 'number.integer')).toBe(true)
    })

    test('missing frn fails validation', () => {
      const { frn, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('frn'))).toBe(true)
    })

    test('invalid frn type (string) fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, frn: 'abc1234567' }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('frn') && d.type === 'number.base')).toBe(true)
    })

    test('invalid frn length (too short) fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, frn: 123 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('frn') && d.type === 'number.min')).toBe(true)
    })

    test('invalid frn length (too long) fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, frn: 12345678901 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('frn') && d.type === 'number.max')).toBe(true)
    })

    test('non-integer frn fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, frn: 1102658375.5 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('frn') && d.type === 'number.integer')).toBe(true)
    })

    test('missing submissionId fails validation', () => {
      const { submissionId, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('submissionId'))).toBe(true)
    })

    test('missing uosr fails validation', () => {
      const { uosr, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('uosr'))).toBe(true)
    })

    test('missing submissionDateTime fails validation', () => {
      const { submissionDateTime, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('submissionDateTime'))).toBe(true)
    })

    test('missing files array fails validation', () => {
      const { files, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('files'))).toBe(true)
    })

    test('empty files array fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, files: [] }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('files') && d.type === 'array.min')).toBe(true)
    })

    test('files array with non-string items fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, files: [123, 'valid.pdf'] }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.type === 'string.base')).toBe(true)
    })

    test('missing filesInSubmission fails validation', () => {
      const { filesInSubmission, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('filesInSubmission'))).toBe(true)
    })

    test('filesInSubmission less than 1 fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, filesInSubmission: 0 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('filesInSubmission') && d.type === 'number.min')).toBe(true)
    })

    test('non-integer filesInSubmission fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, filesInSubmission: 2.5 }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('filesInSubmission') && d.type === 'number.integer')).toBe(true)
    })

    test('missing type fails validation', () => {
      const { type, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('type'))).toBe(true)
    })

    test('invalid type enum fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, type: 'Invalid_Type' }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('type') && d.type === 'any.only')).toBe(true)
    })

    test('missing reference fails validation', () => {
      const { reference, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('reference'))).toBe(true)
    })

    test('missing service fails validation', () => {
      const { service, ...metadata } = validPayload.metadata
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('service'))).toBe(true)
    })

    test('invalid service enum fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, service: 'unknown-service' }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('service') && d.type === 'any.only')).toBe(true)
    })

    test('unknown metadata field fails strict validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        metadata: { ...validPayload.metadata, extraField: 'not allowed' }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.type === 'object.unknown')).toBe(true)
    })
  })

  describe('File upload validation', () => {
    const validFileUpload = validPayload.form['a-file-upload-field']

    test('missing fileId fails validation', () => {
      const { fileId, ...fileUpload } = validFileUpload
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: { 'test-file': fileUpload }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('fileId'))).toBe(true)
    })

    test('invalid fileId UUID format fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, fileId: 'not-a-uuid' }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('fileId') && d.type === 'string.guid')).toBe(true)
    })

    test('missing filename fails validation', () => {
      const { filename, ...fileUpload } = validFileUpload
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: { 'test-file': fileUpload }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('filename'))).toBe(true)
    })

    test('empty filename fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, filename: '' }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('filename') && d.type === 'string.empty')).toBe(true)
    })

    test('missing contentType fails validation', () => {
      const { contentType, ...fileUpload } = validFileUpload
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: { 'test-file': fileUpload }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('contentType'))).toBe(true)
    })

    test('invalid contentType format fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, contentType: 'not-a-mime-type' }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('contentType') && d.type === 'string.pattern.base')).toBe(true)
    })

    test('missing fileStatus fails validation', () => {
      const { fileStatus, ...fileUpload } = validFileUpload
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: { 'test-file': fileUpload }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('fileStatus'))).toBe(true)
    })

    test('invalid fileStatus enum fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, fileStatus: 'invalid-status' }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('fileStatus') && d.type === 'any.only')).toBe(true)
    })

    test('missing contentLength fails validation', () => {
      const { contentLength, ...fileUpload } = validFileUpload
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: { 'test-file': fileUpload }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('contentLength'))).toBe(true)
    })

    test('negative contentLength fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, contentLength: -1 }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('contentLength') && d.type === 'number.min')).toBe(true)
    })

    test('non-integer contentLength fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, contentLength: 1234.56 }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('contentLength') && d.type === 'number.integer')).toBe(true)
    })

    test('missing checksumSha256 fails validation', () => {
      const { checksumSha256, ...fileUpload } = validFileUpload
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: { 'test-file': fileUpload }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('checksumSha256'))).toBe(true)
    })

    test('invalid checksumSha256 format fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, checksumSha256: 'not-base64!' }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('checksumSha256') && d.type === 'string.pattern.base')).toBe(true)
    })

    test('missing detectedContentType fails validation', () => {
      const { detectedContentType, ...fileUpload } = validFileUpload
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: { 'test-file': fileUpload }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('detectedContentType'))).toBe(true)
    })

    test('invalid detectedContentType format fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, detectedContentType: 'invalid' }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('detectedContentType') && d.type === 'string.pattern.base')).toBe(true)
    })

    test('missing s3Key fails validation', () => {
      const { s3Key, ...fileUpload } = validFileUpload
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: { 'test-file': fileUpload }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('s3Key'))).toBe(true)
    })

    test('empty s3Key fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, s3Key: '' }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('s3Key') && d.type === 'string.empty')).toBe(true)
    })

    test('missing s3Bucket fails validation', () => {
      const { s3Bucket, ...fileUpload } = validFileUpload
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: { 'test-file': fileUpload }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('s3Bucket'))).toBe(true)
    })

    test('empty s3Bucket fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, s3Bucket: '' }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.path.includes('s3Bucket') && d.type === 'string.empty')).toBe(true)
    })

    test('unknown file upload field fails strict validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'test-file': { ...validFileUpload, extraField: 'not allowed' }
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.type === 'object.unknown')).toBe(true)
    })
  })

  describe('Form validation', () => {
    test('numberOfRejectedFiles can equal filesInSubmission when all files are rejected', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        numberOfRejectedFiles: validPayload.metadata.filesInSubmission
      })
      expect(error).toBeUndefined()
    })

    test('form with only string fields (no file uploads) fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'text-field-1': 'value1',
          'text-field-2': 'value2'
        }
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.type === 'object.min')).toBe(true)
    })

    test('form with mixed string and file upload passes validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'text-field': 'some text value',
          'file-field': validPayload.form['a-file-upload-field']
        }
      })
      expect(error).toBeUndefined()
    })

    test('form with multiple file uploads passes validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {
          'file-1': validPayload.form['a-file-upload-field'],
          'file-2': validPayload.form['another-file-upload-field']
        }
      })
      expect(error).toBeUndefined()
    })

    test('empty form object fails validation', () => {
      const { error } = callbackPayloadSchema.validate({
        ...validPayload,
        form: {}
      })
      expect(error).toBeDefined()
      expect(error.details.some(d => d.type === 'object.min')).toBe(true)
    })
  })
})
