import { describe, test, expect } from 'vitest'
import { constants as httpConstants } from 'node:http2'

import {
  uploaderStatusParamsSchema,
  cdpUploaderStatusResponseSchema,
  uploaderStatusResponseSchema
} from '../../../../../../src/api/v1/uploader/status/schema.js'

// ─── Shared test fixtures ───────────────────────────────────────────────────

const validUploadId = '9fcaabe5-77ec-44db-8356-3a6e8dc51b13'

const pendingFile = {
  fileId: 'a0b1c2d3-e4f5-4789-abcd-ef0123456789',
  filename: 'document.pdf',
  contentType: 'application/pdf',
  detectedContentType: 'application/pdf',
  fileStatus: 'pending'
}

const completeFile = {
  fileId: 'a0b1c2d3-e4f5-4789-abcd-ef0123456789',
  filename: 'document.pdf',
  contentType: 'application/pdf',
  detectedContentType: 'application/pdf',
  fileStatus: 'complete',
  contentLength: 1024,
  checksumSha256: 'SGVsbG8gV29ybGQ=',
  s3Key: 'scanned/folder/a0b1c2d3-e4f5-4789-abcd-ef0123456789',
  s3Bucket: 'test-bucket'
}

const rejectedFile = {
  fileId: 'a0b1c2d3-e4f5-4789-abcd-ef0123456789',
  filename: 'document.pdf',
  contentType: 'application/pdf',
  detectedContentType: 'application/pdf',
  fileStatus: 'rejected',
  hasError: true,
  errorMessage: 'File rejected: virus detected'
}

const validMetadata = {
  sbi: 105000000,
  crn: 1050000000,
  frn: 1102658375,
  submissionId: '1733826312',
  type: 'CS_Agreement_Evidence',
  reference: 'user entered reference',
  service: 'fcp-sfd-frontend',
  uosr: '105000000_1733826312'
}

const validReadyResponse = {
  uploadStatus: 'ready',
  metadata: validMetadata,
  form: { 'file-field': completeFile },
  numberOfRejectedFiles: 0
}

// Mapped response — as returned by the API after status mapping
const validMappedSuccessResponse = {
  uploadStatus: 'success',
  metadata: validMetadata,
  form: { 'file-field': completeFile }
}

// ─── uploaderStatusParamsSchema ─────────────────────────────────────────────

describe('uploaderStatusParamsSchema', () => {
  test('valid UUID v4 passes', () => {
    const { error } = uploaderStatusParamsSchema.validate({ uploadId: validUploadId })
    expect(error).toBeUndefined()
  })

  test('non-GUID string fails with string.guid error', () => {
    const { error } = uploaderStatusParamsSchema.validate({ uploadId: 'not-a-uuid' })
    expect(error).toBeDefined()
    expect(error.details[0].path).toEqual(['uploadId'])
    expect(error.details[0].type).toBe('string.guid')
    expect(error.message).toContain('uploadId must be a valid UUID v4')
  })

  test('missing uploadId fails with any.required error', () => {
    const { error } = uploaderStatusParamsSchema.validate({})
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('any.required')
    expect(error.message).toContain('uploadId is required')
  })

  test('null uploadId fails', () => {
    const { error } = uploaderStatusParamsSchema.validate({ uploadId: null })
    expect(error).toBeDefined()
  })

  test('integer uploadId fails', () => {
    const { error } = uploaderStatusParamsSchema.validate({ uploadId: 12345 })
    expect(error).toBeDefined()
  })

  test('UUID without hyphens is accepted by Joi guid() validator', () => {
    // Joi's guid() accepts UUID format without hyphens — this is expected Joi behaviour
    const { error } = uploaderStatusParamsSchema.validate({ uploadId: '9fcaabe577ec44db83563a6e8dc51b13' })
    expect(error).toBeUndefined()
  })
})

// ─── cdpUploaderStatusResponseSchema ────────────────────────────────────────

describe('cdpUploaderStatusResponseSchema', () => {
  describe('valid responses', () => {
    test('valid ready response with complete file passes', () => {
      const { error } = cdpUploaderStatusResponseSchema.validate(validReadyResponse)
      expect(error).toBeUndefined()
    })

    test('valid pending response with pending file passes', () => {
      const payload = {
        uploadStatus: 'pending',
        metadata: validMetadata,
        form: { 'file-field': pendingFile }
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })

    test('valid initiated response with empty form passes', () => {
      const payload = {
        uploadStatus: 'initiated',
        metadata: {},
        form: {}
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })

    test('valid ready response with rejected file passes', () => {
      const payload = {
        uploadStatus: 'ready',
        metadata: validMetadata,
        form: { 'file-field': rejectedFile },
        numberOfRejectedFiles: 1
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })

    test('form allows mix of file objects and string fields', () => {
      const payload = {
        uploadStatus: 'ready',
        metadata: validMetadata,
        form: {
          'file-field': completeFile,
          'text-field': 'some text value'
        },
        numberOfRejectedFiles: 0
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })

    test('form allows multiple complete files', () => {
      const secondFile = {
        ...completeFile,
        fileId: 'b1c2d3e4-f5a6-4789-abcd-ef0123456789'
      }
      const payload = {
        uploadStatus: 'ready',
        metadata: validMetadata,
        form: {
          'file-one': completeFile,
          'file-two': secondFile
        },
        numberOfRejectedFiles: 0
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })

    test('allows unknown top-level fields (non-strict mode)', () => {
      const payload = {
        ...validReadyResponse,
        extraField: 'unexpected but allowed'
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })

    test('numberOfRejectedFiles can be greater than zero', () => {
      const payload = {
        ...validReadyResponse,
        numberOfRejectedFiles: 3
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })
  })

  describe('uploadStatus validation', () => {
    test('invalid uploadStatus value fails', () => {
      const payload = { ...validReadyResponse, uploadStatus: 'processing' }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.message).toContain('"uploadStatus" must be one of [initiated, pending, ready]')
    })

    test('missing uploadStatus fails', () => {
      const { uploadStatus, ...payload } = validReadyResponse
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.message).toContain('"uploadStatus" is required')
    })

    test('null uploadStatus fails', () => {
      const payload = { ...validReadyResponse, uploadStatus: null }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
    })

    test('uploadStatus "complete" (not a valid state) fails', () => {
      const payload = { ...validReadyResponse, uploadStatus: 'complete' }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
    })
  })

  describe('metadata validation', () => {
    test('missing metadata fails', () => {
      const { metadata, ...payload } = validReadyResponse
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
    })

    test('null metadata fails', () => {
      const payload = { ...validReadyResponse, metadata: null }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
    })

    test('empty metadata object passes (pass-through)', () => {
      const payload = { ...validReadyResponse, metadata: {} }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })

    test('metadata with any fields passes (no schema restriction on content)', () => {
      const payload = {
        ...validReadyResponse,
        metadata: { anyKey: 'anyValue', nested: { deep: true } }
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })
  })

  describe('form validation', () => {
    test('missing form fails', () => {
      const { form, ...payload } = validReadyResponse
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
    })

    test('null form fails', () => {
      const payload = { ...validReadyResponse, form: null }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
    })

    test('invalid file object in form fails', () => {
      const payload = {
        ...validReadyResponse,
        form: {
          'file-field': {
            fileId: 'not-a-uuid',
            filename: 'test.pdf',
            contentType: 'application/pdf',
            detectedContentType: 'application/pdf',
            fileStatus: 'pending'
          }
        }
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
    })

    test('complete file missing s3Key fails', () => {
      const { s3Key, ...incompleteFile } = completeFile
      const payload = {
        ...validReadyResponse,
        form: { 'file-field': incompleteFile }
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
    })

    test('rejected file with hasError false fails', () => {
      const invalidRejected = { ...rejectedFile, hasError: false }
      const payload = {
        ...validReadyResponse,
        form: { 'file-field': invalidRejected }
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
    })
  })

  describe('numberOfRejectedFiles validation', () => {
    test('missing numberOfRejectedFiles fails when uploadStatus is ready', () => {
      const { numberOfRejectedFiles, ...payload } = validReadyResponse
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.message).toContain('"numberOfRejectedFiles" is required when uploadStatus is ready')
    })

    test('negative numberOfRejectedFiles fails', () => {
      const payload = { ...validReadyResponse, numberOfRejectedFiles: -1 }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.message).toContain('"numberOfRejectedFiles" must be a non-negative integer')
    })

    test('non-integer numberOfRejectedFiles fails', () => {
      const payload = { ...validReadyResponse, numberOfRejectedFiles: 1.5 }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.message).toContain('"numberOfRejectedFiles" must be an integer')
    })

    test('string numberOfRejectedFiles fails', () => {
      const payload = { ...validReadyResponse, numberOfRejectedFiles: 'zero' }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
    })

    test('zero numberOfRejectedFiles passes when uploadStatus is ready', () => {
      const payload = { ...validReadyResponse, numberOfRejectedFiles: 0 }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })

    test('numberOfRejectedFiles is forbidden when uploadStatus is pending', () => {
      const payload = {
        uploadStatus: 'pending',
        metadata: validMetadata,
        form: { 'file-field': pendingFile },
        numberOfRejectedFiles: 0
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('any.unknown')
    })

    test('numberOfRejectedFiles is forbidden when uploadStatus is initiated', () => {
      const payload = {
        uploadStatus: 'initiated',
        metadata: {},
        form: {},
        numberOfRejectedFiles: 0
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('any.unknown')
    })

    test('missing numberOfRejectedFiles passes when uploadStatus is pending', () => {
      const payload = {
        uploadStatus: 'pending',
        metadata: validMetadata,
        form: { 'file-field': pendingFile }
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })

    test('missing numberOfRejectedFiles passes when uploadStatus is initiated', () => {
      const payload = {
        uploadStatus: 'initiated',
        metadata: {},
        form: {}
      }
      const { error } = cdpUploaderStatusResponseSchema.validate(payload)
      expect(error).toBeUndefined()
    })
  })
})

// ─── uploaderStatusResponseSchema (response code map) ───────────────────────

describe('uploaderStatusResponseSchema', () => {
  test('contains a 200 success schema', () => {
    expect(uploaderStatusResponseSchema[httpConstants.HTTP_STATUS_OK]).toBeDefined()
  })

  test('contains a 400 bad request schema', () => {
    expect(uploaderStatusResponseSchema[httpConstants.HTTP_STATUS_BAD_REQUEST]).toBeDefined()
  })

  test('contains a 401 unauthorized schema', () => {
    expect(uploaderStatusResponseSchema[httpConstants.HTTP_STATUS_UNAUTHORIZED]).toBeDefined()
  })

  test('contains a 404 not found schema', () => {
    expect(uploaderStatusResponseSchema[httpConstants.HTTP_STATUS_NOT_FOUND]).toBeDefined()
  })

  test('contains a 500 internal server error schema', () => {
    expect(uploaderStatusResponseSchema[httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR]).toBeDefined()
  })

  test('contains a 502 bad gateway schema', () => {
    expect(uploaderStatusResponseSchema[httpConstants.HTTP_STATUS_BAD_GATEWAY]).toBeDefined()
  })

  test('contains a 504 gateway timeout schema', () => {
    expect(uploaderStatusResponseSchema[httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT]).toBeDefined()
  })

  test('200 schema wraps CDP response in data envelope', () => {
    const successSchema = uploaderStatusResponseSchema[httpConstants.HTTP_STATUS_OK]
    const { error } = successSchema.validate({ data: validMappedSuccessResponse })
    expect(error).toBeUndefined()
  })

  test('200 schema rejects raw CDP ready status', () => {
    const successSchema = uploaderStatusResponseSchema[httpConstants.HTTP_STATUS_OK]
    const { error } = successSchema.validate({ data: validReadyResponse })
    expect(error).toBeDefined()
  })

  test('200 schema rejects missing data envelope', () => {
    const successSchema = uploaderStatusResponseSchema[httpConstants.HTTP_STATUS_OK]
    const { error } = successSchema.validate(validMappedSuccessResponse)
    expect(error).toBeDefined()
  })
})
