import { describe, it, expect } from 'vitest'
import {
  patterns,
  businessIdentifierFields,
  submissionFields,
  baseMetadataSchema,
  fileUploadSchema
} from '../../../../../../src/api/v1/uploader/schemas/index.js'

describe('Shared Schema Components', () => {
  describe('patterns', () => {
    describe('mimeType pattern', () => {
      it('should validate valid MIME types', () => {
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

      it('should reject invalid MIME types', () => {
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
      it('should validate valid base64 strings', () => {
        const validBase64 = [
          'SGVsbG8gV29ybGQ=',
          'YWJjZGVmZ2hpams=',
          'dGVzdA=='
        ]

        validBase64.forEach(str => {
          expect(patterns.base64.test(str)).toBe(true)
        })
      })

      it('should reject invalid base64 strings', () => {
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
      it('should validate valid date time format', () => {
        const validDateTime = [
          '01/02/2023 14:30:45',
          '31/12/2023 23:59:59',
          '15/06/2024 09:00:00'
        ]

        validDateTime.forEach(dt => {
          expect(patterns.dateTime.test(dt)).toBe(true)
        })
      })

      it('should reject invalid date time formats', () => {
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
      it('should validate valid relative paths', () => {
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

      it('should reject invalid relative paths', () => {
        const invalidPaths = [
          '',
          'relative',
          'path/without/leading/slash',
          'https://example.com/path'
        ]

        invalidPaths.forEach(path => {
          expect(patterns.relativePath.test(path)).toBe(false)
        })
      })
    })
  })

  describe('businessIdentifierFields', () => {
    describe('sbi field', () => {
      it('should validate valid SBI numbers', () => {
        const validSBI = 123456789
        const result = businessIdentifierFields.sbi.validate(validSBI)
        expect(result.error).toBeUndefined()
      })

      it('should reject invalid SBI numbers', () => {
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

      it('should provide proper error messages for SBI', () => {
        const result = businessIdentifierFields.sbi.validate(12345678)
        expect(result.error.message).toContain('sbi must be exactly 9 digits')
      })
    })

    describe('crn field', () => {
      it('should validate valid CRN numbers', () => {
        const validCRN = 1234567890
        const result = businessIdentifierFields.crn.validate(validCRN)
        expect(result.error).toBeUndefined()
      })

      it('should reject invalid CRN numbers', () => {
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
      it('should validate valid FRN numbers', () => {
        const validFRN = 1234567890
        const result = businessIdentifierFields.frn.validate(validFRN)
        expect(result.error).toBeUndefined()
      })

      it('should reject invalid FRN numbers', () => {
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
      it('should validate valid submission IDs', () => {
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

      it('should reject invalid submission IDs', () => {
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
      it('should validate required type field', () => {
        const validType = 'CS_Agreement_Evidence'
        const result = submissionFields.type.validate(validType)
        expect(result.error).toBeUndefined()
      })

      it('should reject missing type field', () => {
        const result = submissionFields.type.validate(undefined)
        expect(result.error).toBeDefined()
        expect(result.error.message).toContain('type is required')
      })
    })

    describe('service field', () => {
      it('should validate allowed service values', () => {
        const validServices = ['fcp-sfd-frontend', 'rps-portal']

        validServices.forEach(service => {
          const result = submissionFields.service.validate(service)
          expect(result.error).toBeUndefined()
        })
      })

      it('should reject invalid service values', () => {
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
      it('should validate valid UOSR values', () => {
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

      it('should reject invalid UOSR values', () => {
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

    it('should validate complete valid base metadata', () => {
      const result = baseMetadataSchema.validate(validBaseMetadata)
      expect(result.error).toBeUndefined()
      expect(result.value).toEqual(validBaseMetadata)
    })

    it('should reject metadata missing required fields', () => {
      const requiredFields = ['sbi', 'crn', 'frn', 'submissionId', 'type', 'reference', 'service', 'uosr']

      requiredFields.forEach(field => {
        const incompleteMetadata = { ...validBaseMetadata }
        delete incompleteMetadata[field]

        const result = baseMetadataSchema.validate(incompleteMetadata)
        expect(result.error).toBeDefined()
        expect(result.error.message).toContain(`${field} is required`)
      })
    })

    it('should reject metadata with extra fields (strict mode)', () => {
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
    const validFileUpload = {
      fileId: 'a0b1c2d3-e4f5-4789-abcd-ef0123456789',
      filename: 'test-document.pdf',
      contentType: 'application/pdf',
      fileStatus: 'complete',
      contentLength: 1024,
      checksumSha256: 'SGVsbG8gV29ybGQ=',
      detectedContentType: 'application/pdf',
      s3Key: 'test/path/file.pdf',
      s3Bucket: 'test-bucket'
    }

    it('should validate complete valid file upload', () => {
      const result = fileUploadSchema.validate(validFileUpload)
      expect(result.error).toBeUndefined()
      expect(result.value).toEqual(validFileUpload)
    })

    it('should reject file upload missing required fields', () => {
      const requiredFields = [
        'fileId', 'filename', 'contentType', 'fileStatus',
        'contentLength', 'checksumSha256', 'detectedContentType',
        's3Key', 's3Bucket'
      ]

      requiredFields.forEach(field => {
        const incompleteFileUpload = { ...validFileUpload }
        delete incompleteFileUpload[field]

        const result = fileUploadSchema.validate(incompleteFileUpload)
        expect(result.error).toBeDefined()
        expect(result.error.message).toContain(`${field} is required`)
      })
    })

    it('should validate fileId as UUID', () => {
      const invalidFileIds = [
        'not-a-uuid',
        '123',
        'invalid-format'
      ]

      invalidFileIds.forEach(fileId => {
        const fileUploadWithInvalidId = { ...validFileUpload, fileId }
        const result = fileUploadSchema.validate(fileUploadWithInvalidId)
        expect(result.error).toBeDefined()
        expect(result.error.message).toContain('fileId must be a valid UUID v4')
      })
    })

    it('should validate MIME types', () => {
      const invalidMimeTypes = [
        'invalid',
        'text/'
      ]

      invalidMimeTypes.forEach(contentType => {
        const fileUploadWithInvalidMime = { ...validFileUpload, contentType }
        const result = fileUploadSchema.validate(fileUploadWithInvalidMime)
        expect(result.error).toBeDefined()
        expect(result.error.message).toContain('contentType must be a valid MIME type')
      })
    })

    it('should validate contentLength as non-negative integer', () => {
      const invalidContentLengths = [
        -1,
        1.5,
        'string'
      ]

      invalidContentLengths.forEach(contentLength => {
        const fileUploadWithInvalidLength = { ...validFileUpload, contentLength }
        const result = fileUploadSchema.validate(fileUploadWithInvalidLength)
        expect(result.error).toBeDefined()
      })
    })

    it('should validate checksumSha256 as base64', () => {
      const invalidChecksums = [
        'not-base64',
        '!!!invalid'
      ]

      invalidChecksums.forEach(checksumSha256 => {
        const fileUploadWithInvalidChecksum = { ...validFileUpload, checksumSha256 }
        const result = fileUploadSchema.validate(fileUploadWithInvalidChecksum)
        expect(result.error).toBeDefined()
        expect(result.error.message).toContain('checksumSha256 must be a valid base64 string')
      })
    })

    it('should reject extra fields (strict mode)', () => {
      const fileUploadWithExtraField = {
        ...validFileUpload,
        extraField: 'not allowed'
      }

      const result = fileUploadSchema.validate(fileUploadWithExtraField)
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('extraField')
    })
  })

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle null values gracefully', () => {
      const result = baseMetadataSchema.validate(null)
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('must be of type object')
    })

    it('should handle empty objects', () => {
      const result = baseMetadataSchema.validate({}, { abortEarly: false })
      expect(result.error).toBeDefined()
      // Should contain errors for all required fields
      const requiredFields = ['sbi', 'crn', 'frn', 'submissionId', 'type', 'reference', 'service', 'uosr']
      requiredFields.forEach(field => {
        expect(result.error.message).toContain(`${field} is required`)
      })
    })

    it('should handle very large numbers gracefully', () => {
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
