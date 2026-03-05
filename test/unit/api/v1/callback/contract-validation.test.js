import { describe, test, expect } from 'vitest'
import { callbackPayloadSchema } from '../../../../../src/api/v1/callback/schema.js'
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
    payload.form = { 'rejected-file': file }

    const { error } = callbackPayloadSchema.validate(payload)
    expect(error).toBeUndefined()
  })

  test('REJECTED file without errorMessage fails validation', () => {
    const payload = { ...base }
    const file = { ...payload.form['a-file-upload-field'], fileStatus: 'rejected', hasError: true }
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
