import { describe, test, expect } from 'vitest'
import { validateFormFiles } from '../../../../../../src/api/v1/callback/validation/validate-form-files.js'

describe('validateFormFiles', () => {
  test('returns valid when form is null', () => {
    expect(validateFormFiles(null)).toEqual({ isValid: true })
  })

  test('returns valid when form is undefined', () => {
    expect(validateFormFiles(undefined)).toEqual({ isValid: true })
  })

  test('returns valid when form is not an object', () => {
    expect(validateFormFiles('string')).toEqual({ isValid: true })
  })

  test('returns valid when form has no file uploads (only text fields)', () => {
    const form = {
      'text-field': 'some value',
      'another-text-field': 'another value'
    }
    expect(validateFormFiles(form)).toEqual({ isValid: true })
  })

  test('returns valid when all file uploads are consistent', () => {
    const form = {
      'file-1': {
        fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        filename: 'test.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'complete',
        contentLength: 1024,
        checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
        s3Key: 'scanned/abc/123',
        s3Bucket: 'test-bucket'
      },
      'text-field': 'not a file'
    }
    expect(validateFormFiles(form)).toEqual({ isValid: true })
  })

  test('returns invalid when a file upload fails consistency check', () => {
    const form = {
      'file-1': {
        fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        filename: 'test.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'complete',
        contentLength: 1024,
        checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
        s3Key: 'scanned/abc/123',
        s3Bucket: 'test-bucket'
      },
      'file-2': {
        fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554',
        filename: 'bad.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'complete',
        contentLength: 0 // Invalid: must be > 0 for complete files
      }
    }

    const result = validateFormFiles(form)
    expect(result.isValid).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.file).toBeDefined()
    expect(result.file.fileId).toBe('3f90b889-eac7-4e98-975f-93fcef5b8554')
  })

  test('skips non-object entries and null values in form', () => {
    const form = {
      'text-field': 'hello',
      'number-field': 42,
      'null-field': null,
      'file-1': {
        fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        filename: 'test.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'complete',
        contentLength: 1024,
        checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
        s3Key: 'scanned/abc/123',
        s3Bucket: 'test-bucket'
      }
    }
    expect(validateFormFiles(form)).toEqual({ isValid: true })
  })

  test('returns invalid for first failing file (short-circuits)', () => {
    const form = {
      'file-1': {
        fileId: 'aaaa-bbbb',
        filename: 'first.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'complete',
        contentLength: 0 // fails
      },
      'file-2': {
        fileId: 'cccc-dddd',
        filename: 'second.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'complete',
        contentLength: 0 // also fails, but shouldn't be reached
      }
    }

    const result = validateFormFiles(form)
    expect(result.isValid).toBe(false)
    // Should fail on first file encountered
    expect(result.file.fileId).toBe('aaaa-bbbb')
  })
})
