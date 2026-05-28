import { describe, test, expect, vi } from 'vitest'
import Joi from 'joi'
import {
  patterns,
  businessIdentifierFields,
  submissionFields,
  baseMetadataSchema,
  fileUploadSchema,
  uploaderResponseFields,
  mappedResponseFields
} from '../../../../../../src/api/v1/schemas/uploader-common.js'

const { mockMimeTypes } = vi.hoisted(() => ({
  mockMimeTypes: ['application/pdf', 'image/jpeg', 'image/png']
}))

vi.mock('../../../../../../src/config/index.js', () => ({
  config: {
    get: (key) => key === 'cdpUploaderMimeTypes' ? mockMimeTypes : null
  }
}))

describe('Shared Schema Components', () => {
  describe('patterns', () => {
    describe('mimeType pattern', () => {
      test('should validate valid MIME types', () => {
        const validMimeTypes = [
          'application/pdf',
          'image/jpeg',
          'text/plain',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ]

        validMimeTypes.forEach(mimeType => {
          expect(patterns.mimeType.test(mimeType)).toBe(true)
        })
      })

      test('should reject invalid MIME types', () => {
        const invalidMimeTypes = [
          '',
          'invalid',
          'text/',
          '/plain',
          'text//plain',
          'text\\plain'
        ]

        invalidMimeTypes.forEach(mimeType => {
          expect(patterns.mimeType.test(mimeType)).toBe(false)
        })
      })
    })

    describe('base64 pattern', () => {
      test('should validate valid base64 strings', () => {
        const validBase64 = [
          'SGVsbG8gV29ybGQ=',
          'YWJjZGVmZ2hpams=',
          'dGVzdA=='
        ]

        validBase64.forEach(str => {
          expect(patterns.base64.test(str)).toBe(true)
        })
      })

      test('should reject invalid base64 strings', () => {
        const invalidBase64 = [
          '',
          'not base64',
          '!!!invalid!!!',
          'SGVsbG8@'
        ]

        invalidBase64.forEach(str => {
          expect(patterns.base64.test(str)).toBe(false)
        })
      })
    })

    describe('dateTime pattern', () => {
      test('should validate valid date time format', () => {
        const validDateTime = [
          '01/02/2023 14:30:45',
          '31/12/2023 23:59:59',
          '15/06/2024 09:00:00'
        ]

        validDateTime.forEach(dt => {
          expect(patterns.dateTime.test(dt)).toBe(true)
        })
      })

      test('should reject invalid date time formats', () => {
        const invalidDateTime = [
          '',
          '2023-02-01 14:30:45',
          '1/2/2023 14:30:45',
          '01/02/23 14:30:45',
          '01/02/2023 14:30',
          '01/02/2023'
        ]

        invalidDateTime.forEach(dt => {
          expect(patterns.dateTime.test(dt)).toBe(false)
        })
      })
    })

    describe('relativePath pattern', () => {
      test('should validate valid relative paths', () => {
        const validPaths = [
          '/',
          '/home',
          '/path/to/resource',
          '/upload-complete'
        ]

        validPaths.forEach(path => {
          expect(patterns.relativePath.test(path)).toBe(true)
        })
      })

      test('should reject invalid relative paths', () => {
        const invalidPaths = [
          '',
          'relative',
          'path/without/leading/slash',
          'https://example.com/path',
          '//evil.com'
        ]

        invalidPaths.forEach(path => {
          expect(patterns.relativePath.test(path)).toBe(false)
        })
      })
    })
  })

  describe('businessIdentifierFields', () => {
    describe('sbi field', () => {
      test('should validate valid SBI numbers', () => {
        const validSBI = 123456789
        const result = businessIdentifierFields.sbi.validate(validSBI)
        expect(result.error).toBeUndefined()
      })

      test('should reject invalid SBI numbers', () => {
        const invalidSBIs = [
          null,
          undefined,
          '',
          'string',
          12345678, // too short
          1234567890, // too long
          123.456789 // decimal
        ]

        invalidSBIs.forEach(sbi => {
          const result = businessIdentifierFields.sbi.validate(sbi)
          expect(result.error).toBeDefined()
        })
      })

      test('should provide proper error messages for SBI', () => {
        const result = businessIdentifierFields.sbi.validate(12345678)
        expect(result.error.message).toContain('sbi must be exactly 9 digits')
      })
    })

    describe('crn field', () => {
      test('should validate valid CRN numbers', () => {
        const validCRN = 1234567890
        const result = businessIdentifierFields.crn.validate(validCRN)
        expect(result.error).toBeUndefined()
      })

      test('should reject invalid CRN numbers', () => {
        const invalidCRNs = [
          null,
          undefined,
          '',
          'string',
          123456789, // too short
          12345678901, // too long
          123.4567890 // decimal
        ]

        invalidCRNs.forEach(crn => {
          const result = businessIdentifierFields.crn.validate(crn)
          expect(result.error).toBeDefined()
        })
      })
    })

    describe('frn field', () => {
      test('should validate valid FRN numbers', () => {
        const validFRN = 1234567890
        const result = businessIdentifierFields.frn.validate(validFRN)
        expect(result.error).toBeUndefined()
      })

      test('should reject invalid FRN numbers', () => {
        const invalidFRNs = [
          null,
          undefined,
          '',
          'string',
          123456789, // too short
          12345678901, // too long
          123.4567890 // decimal
        ]

        invalidFRNs.forEach(frn => {
          const result = businessIdentifierFields.frn.validate(frn)
          expect(result.error).toBeDefined()
        })
      })
    })
  })

  describe('submissionFields', () => {
    describe('submissionId field', () => {
      test('should validate valid submission IDs', () => {
        const validSubmissionIds = [
          'abc123',
          'submission-123',
          'UUID-like-string'
        ]

        validSubmissionIds.forEach(id => {
          const result = submissionFields.submissionId.validate(id)
          expect(result.error).toBeUndefined()
        })
      })

      test('should reject invalid submission IDs', () => {
        const invalidSubmissionIds = [
          null,
          undefined,
          '',
          123 // not a string
        ]

        invalidSubmissionIds.forEach(id => {
          const result = submissionFields.submissionId.validate(id)
          expect(result.error).toBeDefined()
        })
      })
    })

    describe('type field', () => {
      test('should validate required type field', () => {
        const validType = 'CS_Agreement_Evidence'
        const result = submissionFields.type.validate(validType)
        expect(result.error).toBeUndefined()
      })

      test('should reject missing type field', () => {
        const result = submissionFields.type.validate(undefined)
        expect(result.error).toBeDefined()
        expect(result.error.message).toContain('type is required')
      })
    })

    describe('service field', () => {
      test('should validate allowed service values', () => {
        const validServices = ['fcp-sfd-frontend', 'rps-portal']

        validServices.forEach(service => {
          const result = submissionFields.service.validate(service)
          expect(result.error).toBeUndefined()
        })
      })

      test('should reject invalid service values', () => {
        const invalidServices = [
          '',
          'invalid-service',
          'unknown'
        ]

        invalidServices.forEach(service => {
          const result = submissionFields.service.validate(service)
          expect(result.error).toBeDefined()
          expect(result.error.message).toContain('service must be either fcp-sfd-frontend or rps-portal')
        })
      })
    })

    describe('uosr field', () => {
      test('should validate valid UOSR values', () => {
        const validUOSRs = [
          '123456789-submission123',
          'uosr-value',
          'any-string'
        ]

        validUOSRs.forEach(uosr => {
          const result = submissionFields.uosr.validate(uosr)
          expect(result.error).toBeUndefined()
        })
      })

      test('should reject invalid UOSR values', () => {
        const invalidUOSRs = [
          null,
          undefined,
          ''
        ]

        invalidUOSRs.forEach(uosr => {
          const result = submissionFields.uosr.validate(uosr)
          expect(result.error).toBeDefined()
        })
      })
    })
  })

  describe('baseMetadataSchema', () => {
    const validBaseMetadata = {
      sbi: 123456789,
      crn: 1234567890,
      frn: 1234567890,
      submissionId: 'test-submission-123',
      type: 'CS_Agreement_Evidence',
      reference: 'Test Reference',
      service: 'fcp-sfd-frontend',
      uosr: 'uosr-test-123'
    }

    test('should validate complete valid base metadata', () => {
      const result = baseMetadataSchema.validate(validBaseMetadata)
      expect(result.error).toBeUndefined()
      expect(result.value).toEqual(validBaseMetadata)
    })

    test('should reject metadata missing required fields', () => {
      const requiredFields = ['sbi', 'crn', 'frn', 'submissionId', 'type', 'reference', 'service', 'uosr']

      requiredFields.forEach(field => {
        const incompleteMetadata = { ...validBaseMetadata }
        delete incompleteMetadata[field]

        const result = baseMetadataSchema.validate(incompleteMetadata)
        expect(result.error).toBeDefined()
        expect(result.error.message).toContain(`${field} is required`)
      })
    })

    test('should reject metadata with extra fields (strict mode)', () => {
      const metadataWithExtraField = {
        ...validBaseMetadata,
        extraField: 'not allowed'
      }

      const result = baseMetadataSchema.validate(metadataWithExtraField)
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('extraField')
    })
  })

  describe('fileUploadSchema', () => {
    const baseFileUpload = {
      fileId: 'a0b1c2d3-e4f5-4789-abcd-ef0123456789',
      filename: 'test-document.pdf',
      contentType: 'application/pdf',
      detectedContentType: 'application/pdf'
    }

    test('should validate complete valid file upload', () => {
      const completeFileUpload = {
        ...baseFileUpload,
        fileStatus: 'complete',
        contentLength: 1024,
        checksumSha256: 'SGVsbG8gV29ybGQ=',
        s3Key: 'test/path/file.pdf',
        s3Bucket: 'test-bucket'
      }
      const result = fileUploadSchema.validate(completeFileUpload)
      expect(result.error).toBeUndefined()
      expect(result.value).toEqual(completeFileUpload)
    })

    test('should validate pending file upload with minimal required fields', () => {
      const pendingFileUpload = {
        ...baseFileUpload,
        fileStatus: 'pending'
      }
      const result = fileUploadSchema.validate(pendingFileUpload)
      expect(result.error).toBeUndefined()
    })

    test('should validate fileId as UUID', () => {
      const invalidFileIds = [
        'not-a-uuid',
        '123',
        'invalid-format'
      ]

      invalidFileIds.forEach(fileId => {
        const fileUploadWithInvalidId = { ...baseFileUpload, fileStatus: 'pending', fileId }
        const result = fileUploadSchema.validate(fileUploadWithInvalidId)
        expect(result.error).toBeDefined()
        expect(result.error.message).toContain('fileId')
      })
    })

    test('should accept all allowed MIME types for contentType', () => {
      mockMimeTypes.forEach(contentType => {
        const fileUpload = { ...baseFileUpload, fileStatus: 'pending', contentType, detectedContentType: contentType }
        const result = fileUploadSchema.validate(fileUpload)
        expect(result.error).toBeUndefined()
      })
    })

    test('should reject MIME types not in the allowlist', () => {
      const disallowedMimeTypes = [
        'invalid',
        'text/',
        'text/plain',
        'video/mp4',
        'audio/mpeg',
        'application/zip'
      ]

      disallowedMimeTypes.forEach(contentType => {
        const fileUploadWithInvalidMime = { ...baseFileUpload, fileStatus: 'pending', contentType }
        const result = fileUploadSchema.validate(fileUploadWithInvalidMime)
        expect(result.error).toBeDefined()
        expect(result.error.message).toContain('contentType')
      })
    })

    test('should require complete-file storage fields', () => {
      const incompleteCompleteFile = {
        ...baseFileUpload,
        fileStatus: 'complete',
        contentLength: 1024,
        checksumSha256: 'SGVsbG8gV29ybGQ=',
        s3Bucket: 'test-bucket'
      }
      const result = fileUploadSchema.validate(incompleteCompleteFile)
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('s3Key')
    })

    test('should require hasError=true and errorMessage for rejected files', () => {
      const rejectedFile = {
        ...baseFileUpload,
        fileStatus: 'rejected',
        hasError: true,
        errorMessage: 'Virus detected'
      }
      const validResult = fileUploadSchema.validate(rejectedFile)
      expect(validResult.error).toBeUndefined()

      const invalidRejectedFile = {
        ...baseFileUpload,
        fileStatus: 'rejected',
        hasError: false,
        errorMessage: 'Virus detected'
      }
      const invalidResult = fileUploadSchema.validate(invalidRejectedFile)
      expect(invalidResult.error).toBeDefined()
      expect(invalidResult.error.message).toContain('hasError')
    })

    test('should allow detectedContentType and checksumSha256 for rejected files (CDP Uploader includes them)', () => {
      const rejectedFileWithFields = {
        ...baseFileUpload,
        fileStatus: 'rejected',
        hasError: true,
        errorMessage: 'The selected file contains a virus',
        checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
        contentLength: 10503
      }
      const result = fileUploadSchema.validate(rejectedFileWithFields)
      expect(result.error).toBeUndefined()
    })

    test('should still forbid s3Key and s3Bucket for rejected files', () => {
      const rejectedFileWithS3 = {
        ...baseFileUpload,
        fileStatus: 'rejected',
        hasError: true,
        errorMessage: 'Virus detected',
        s3Key: 'some/key',
        s3Bucket: 'some-bucket'
      }
      const result = fileUploadSchema.validate(rejectedFileWithS3)
      expect(result.error).toBeDefined()
    })

    test('should reject extra fields (strict mode)', () => {
      const fileUploadWithExtraField = {
        ...baseFileUpload,
        fileStatus: 'pending',
        extraField: 'not allowed'
      }

      const result = fileUploadSchema.validate(fileUploadWithExtraField)
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('extraField')
    })
  })

  describe('Edge Cases and Error Scenarios', () => {
    test('should handle null values gracefully', () => {
      const result = baseMetadataSchema.validate(null)
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('must be of type object')
    })

    test('should handle empty objects', () => {
      const result = baseMetadataSchema.validate({}, { abortEarly: false })
      expect(result.error).toBeDefined()
      // Should contain errors for all required fields
      const requiredFields = ['sbi', 'crn', 'frn', 'submissionId', 'type', 'reference', 'service', 'uosr']
      requiredFields.forEach(field => {
        expect(result.error.message).toContain(`${field} is required`)
      })
    })

    test('should handle very large numbers gracefully', () => {
      const metadataWithLargeNumbers = {
        sbi: 99999999999999, // way too large
        crn: 99999999999999,
        frn: 99999999999999,
        submissionId: 'test',
        type: 'CS_Agreement_Evidence',
        reference: 'test',
        service: 'fcp-sfd-frontend',
        uosr: 'test'
      }

      const result = baseMetadataSchema.validate(metadataWithLargeNumbers)
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('must be exactly')
    })
  })
})

describe('uploaderResponseFields', () => {
  describe('uploadStatus field', () => {
    test('valid status "initiated" passes', () => {
      const { error } = uploaderResponseFields.uploadStatus.validate('initiated')
      expect(error).toBeUndefined()
    })

    test('valid status "pending" passes', () => {
      const { error } = uploaderResponseFields.uploadStatus.validate('pending')
      expect(error).toBeUndefined()
    })

    test('valid status "ready" passes', () => {
      const { error } = uploaderResponseFields.uploadStatus.validate('ready')
      expect(error).toBeUndefined()
    })

    test('invalid status value fails with any.only error', () => {
      const { error } = uploaderResponseFields.uploadStatus.validate('processing')
      expect(error).toBeDefined()
      expect(error.message).toContain('"uploadStatus" must be one of [initiated, pending, ready]')
    })

    test('missing value fails with any.required error', () => {
      const { error } = uploaderResponseFields.uploadStatus.validate(undefined)
      expect(error).toBeDefined()
      expect(error.message).toContain('"uploadStatus" is required')
    })

    test('null value fails', () => {
      const { error } = uploaderResponseFields.uploadStatus.validate(null)
      expect(error).toBeDefined()
    })
  })

  describe('numberOfRejectedFiles field', () => {
    // numberOfRejectedFiles uses Joi.when('uploadStatus', ...) and requires sibling context.
    // We test conditional behaviour via a wrapper schema that mirrors how it is used in production.
    const wrapperSchema = Joi.object({
      uploadStatus: uploaderResponseFields.uploadStatus,
      numberOfRejectedFiles: uploaderResponseFields.numberOfRejectedFiles
    })

    test('zero passes when uploadStatus is ready', () => {
      const { error } = wrapperSchema.validate({ uploadStatus: 'ready', numberOfRejectedFiles: 0 })
      expect(error).toBeUndefined()
    })

    test('positive integer passes when uploadStatus is ready', () => {
      const { error } = wrapperSchema.validate({ uploadStatus: 'ready', numberOfRejectedFiles: 3 })
      expect(error).toBeUndefined()
    })

    test('missing numberOfRejectedFiles fails when uploadStatus is ready', () => {
      const { error } = wrapperSchema.validate({ uploadStatus: 'ready' })
      expect(error).toBeDefined()
      expect(error.message).toContain('"numberOfRejectedFiles" is required when uploadStatus is ready')
    })

    test('negative integer fails when uploadStatus is ready', () => {
      const { error } = wrapperSchema.validate({ uploadStatus: 'ready', numberOfRejectedFiles: -1 })
      expect(error).toBeDefined()
      expect(error.message).toContain('"numberOfRejectedFiles" must be a non-negative integer')
    })

    test('decimal fails when uploadStatus is ready', () => {
      const { error } = wrapperSchema.validate({ uploadStatus: 'ready', numberOfRejectedFiles: 1.5 })
      expect(error).toBeDefined()
      expect(error.message).toContain('"numberOfRejectedFiles" must be an integer')
    })

    test('numberOfRejectedFiles is forbidden when uploadStatus is pending', () => {
      const { error } = wrapperSchema.validate({ uploadStatus: 'pending', numberOfRejectedFiles: 0 })
      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('any.unknown')
    })

    test('missing numberOfRejectedFiles passes when uploadStatus is pending', () => {
      const { error } = wrapperSchema.validate({ uploadStatus: 'pending' })
      expect(error).toBeUndefined()
    })

    test('numberOfRejectedFiles is forbidden when uploadStatus is initiated', () => {
      const { error } = wrapperSchema.validate({ uploadStatus: 'initiated', numberOfRejectedFiles: 0 })
      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('any.unknown')
    })

    test('missing numberOfRejectedFiles passes when uploadStatus is initiated', () => {
      const { error } = wrapperSchema.validate({ uploadStatus: 'initiated' })
      expect(error).toBeUndefined()
    })

    test('string value fails when uploadStatus is ready', () => {
      const { error } = wrapperSchema.validate({ uploadStatus: 'ready', numberOfRejectedFiles: 'zero' })
      expect(error).toBeDefined()
    })
  })
})

describe('mappedResponseFields', () => {
  describe('uploadStatus field', () => {
    test('valid status "pending" passes', () => {
      const { error } = mappedResponseFields.uploadStatus.validate('pending')
      expect(error).toBeUndefined()
    })

    test('valid status "success" passes', () => {
      const { error } = mappedResponseFields.uploadStatus.validate('success')
      expect(error).toBeUndefined()
    })

    test('valid status "failure" passes', () => {
      const { error } = mappedResponseFields.uploadStatus.validate('failure')
      expect(error).toBeUndefined()
    })

    test('raw CDP status "ready" fails', () => {
      const { error } = mappedResponseFields.uploadStatus.validate('ready')
      expect(error).toBeDefined()
      expect(error.message).toContain('"uploadStatus" must be one of [pending, success, failure]')
    })

    test('raw CDP status "initiated" fails', () => {
      const { error } = mappedResponseFields.uploadStatus.validate('initiated')
      expect(error).toBeDefined()
      expect(error.message).toContain('"uploadStatus" must be one of [pending, success, failure]')
    })

    test('arbitrary string fails', () => {
      const { error } = mappedResponseFields.uploadStatus.validate('processing')
      expect(error).toBeDefined()
    })

    test('missing value fails with any.required error', () => {
      const { error } = mappedResponseFields.uploadStatus.validate(undefined)
      expect(error).toBeDefined()
      expect(error.message).toContain('"uploadStatus" is required')
    })

    test('null value fails', () => {
      const { error } = mappedResponseFields.uploadStatus.validate(null)
      expect(error).toBeDefined()
    })
  })
})
