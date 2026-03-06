import { describe, test, expect } from 'vitest'
import { validateFileUploadConsistency } from '../../../../../../src/api/v1/callback/validation/validate-file-upload-consistency.js'

const completeFile = {
  fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
  filename: 'document.pdf',
  contentType: 'application/pdf',
  detectedContentType: 'application/pdf',
  fileStatus: 'complete',
  contentLength: 1024,
  checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
  s3Key: 'scanned/abc/123',
  s3Bucket: 'test-bucket'
}

const rejectedFile = {
  fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554',
  filename: 'virus.exe',
  contentType: 'application/octet-stream',
  detectedContentType: 'application/octet-stream',
  fileStatus: 'rejected',
  hasError: true,
  errorMessage: 'File contains virus'
}

describe('validateFileUploadConsistency', () => {
  describe('missing fileStatus', () => {
    test('returns invalid when fileStatus is missing', () => {
      const result = validateFileUploadConsistency({})
      expect(result).toEqual({ isValid: false, error: 'fileStatus is required' })
    })
  })

  describe('complete files', () => {
    test('valid complete file passes', () => {
      expect(validateFileUploadConsistency(completeFile)).toEqual({ isValid: true })
    })

    test('missing s3Key fails', () => {
      const file = { ...completeFile, s3Key: undefined }
      delete file.s3Key
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('s3Key')
    })

    test('missing s3Bucket fails', () => {
      const file = { ...completeFile }
      delete file.s3Bucket
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('s3Bucket')
    })

    test('missing checksumSha256 fails', () => {
      const file = { ...completeFile }
      delete file.checksumSha256
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('checksumSha256')
    })

    test('contentLength of 0 fails', () => {
      const file = { ...completeFile, contentLength: 0 }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('contentLength')
    })

    test('negative contentLength fails', () => {
      const file = { ...completeFile, contentLength: -1 }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('contentLength')
    })

    test('hasError present fails', () => {
      const file = { ...completeFile, hasError: false }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('hasError')
    })

    test('errorMessage present fails', () => {
      const file = { ...completeFile, errorMessage: 'some error' }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('errorMessage')
    })

    test('invalid base64 checksum fails', () => {
      const file = { ...completeFile, checksumSha256: '!!!not-base64!!!' }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('base64')
    })

    test('URL-safe base64 checksum passes', () => {
      const file = { ...completeFile, checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=' }
      expect(validateFileUploadConsistency(file)).toEqual({ isValid: true })
    })
  })

  describe('rejected files', () => {
    test('valid rejected file passes', () => {
      expect(validateFileUploadConsistency(rejectedFile)).toEqual({ isValid: true })
    })

    test('missing hasError fails', () => {
      const file = { ...rejectedFile }
      delete file.hasError
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('hasError')
    })

    test('hasError=false fails', () => {
      const file = { ...rejectedFile, hasError: false }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('hasError')
    })

    test('missing errorMessage fails', () => {
      const file = { ...rejectedFile }
      delete file.errorMessage
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('errorMessage')
    })

    test('non-string errorMessage fails', () => {
      const file = { ...rejectedFile, errorMessage: 123 }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('errorMessage')
    })

    test('whitespace-only errorMessage fails', () => {
      const file = { ...rejectedFile, errorMessage: '   ' }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('errorMessage')
    })

    test('s3Key present fails', () => {
      const file = { ...rejectedFile, s3Key: 'some/key' }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('s3Key')
    })

    test('s3Bucket present fails', () => {
      const file = { ...rejectedFile, s3Bucket: 'some-bucket' }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('s3Bucket')
    })

    test('checksumSha256 present fails', () => {
      const file = { ...rejectedFile, checksumSha256: 'abc=' }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('checksumSha256')
    })
  })

  describe('unknown fileStatus', () => {
    test('pending status returns invalid', () => {
      const file = { ...completeFile, fileStatus: 'pending' }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('pending')
    })

    test('unknown status returns invalid', () => {
      const file = { ...completeFile, fileStatus: 'processing' }
      const result = validateFileUploadConsistency(file)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('processing')
    })
  })
})
