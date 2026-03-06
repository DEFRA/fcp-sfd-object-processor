import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest'

import { db } from '../../../../src/data/db.js'
import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'
import { mockScanAndUploadResponse, mockScanAndUploadResponseSingleFile } from '../../../mocks/cdp-uploader.js'

let server
let originalMetadataCollection
let originalOutboxCollection
let originalStatusCollection
let metadataCollection
let outboxCollection
let statusCollection

beforeAll(async () => {
  // set a new collection for each integration test to avoid db clashes between tests
  vi.restoreAllMocks()
  originalMetadataCollection = config.get('mongo.collections.uploadMetadata')
  originalOutboxCollection = config.get('mongo.collections.outbox')
  originalStatusCollection = config.get('mongo.collections.status')

  config.set('mongo.collections.uploadMetadata', 'callback-test-collection')
  config.set('mongo.collections.outbox', 'callback-test-outbox-collection')
  config.set('mongo.collections.status', 'callback-test-status-collection')

  metadataCollection = config.get('mongo.collections.uploadMetadata')
  outboxCollection = config.get('mongo.collections.outbox')
  statusCollection = config.get('mongo.collections.status')

  await db.collection(metadataCollection).deleteMany({})
  await db.collection(outboxCollection).deleteMany({})
  await db.collection(statusCollection).deleteMany({})
})

afterEach(async () => {
  // Clean up data after each test to prevent memory accumulation
  vi.restoreAllMocks()
  await db.collection(metadataCollection).deleteMany({})
  await db.collection(outboxCollection).deleteMany({})
  await db.collection(statusCollection).deleteMany({})
})

afterAll(async () => {
  // test cleanup
  vi.restoreAllMocks()
  await db.collection(metadataCollection).deleteMany({})
  await db.collection(outboxCollection).deleteMany({})
  await db.collection(statusCollection).deleteMany({})

  // Stop server to prevent memory leaks
  if (server && typeof server.stop === 'function') {
    await server.stop()
  }

  config.set('mongo.collections.uploadMetadata', originalMetadataCollection)
  config.set('mongo.collections.outbox', originalOutboxCollection)
  config.set('mongo.collections.status', originalStatusCollection)
})

describe('POST to the /api/v1/callback route', async () => {
  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    if (server && typeof server.stop === 'function') {
      await server.stop()
    }
  })

  describe('with a valid payload', async () => {
    test('should save a document into the collection', async () => {
      const beforeMetadataCount = await db.collection(metadataCollection).countDocuments()
      const beforeOutboxCount = await db.collection(outboxCollection).countDocuments()
      const beforeStatusCount = await db.collection(statusCollection).countDocuments()

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanAndUploadResponse
      })

      const afterMetadataCount = await db.collection(metadataCollection).countDocuments()
      const afterOutboxCount = await db.collection(outboxCollection).countDocuments()
      const afterStatusCount = await db.collection(statusCollection).countDocuments()

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanAndUploadResponse.metadata.sbi, validated: true })
        .sort({ timestamp: -1 })
        .limit(2)
        .toArray()

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

      expect(afterMetadataCount - beforeMetadataCount).toBe(2)
      expect(afterOutboxCount - beforeOutboxCount).toBe(2)
      expect(afterStatusCount - beforeStatusCount).toBe(2)

      expect(statusRecords).toBeDefined()
      expect(statusRecords).toHaveLength(2)
      statusRecords.forEach((status) => {
        expect(status.validated).toBe(true)
        expect(status.errors).toBeNull()
        expect(status.timestamp).toBeInstanceOf(Date)
      })
    })
  })

  describe('fileStatus variants (rejected/pending)', async () => {
    test('should persist validation-failure status for rejected file (no metadata)', async () => {
      const payload = JSON.parse(JSON.stringify(mockScanAndUploadResponseSingleFile))
      // Replace the file upload object with a minimal rejected file (no s3/checksum)
      const minimalRejected = {
        fileId: '550e8400-e29b-41d4-a716-446655440001',
        filename: 'infected.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'rejected',
        hasError: true,
        errorMessage: 'File contains virus: Trojan.Generic'
      }
      payload.form = { 'rejected-file': minimalRejected }
      payload.metadata = { ...payload.metadata, submissionId: `rejected-${Date.now()}` }

      const beforeMetadataCount = await db.collection(metadataCollection).countDocuments()
      const beforeOutboxCount = await db.collection(outboxCollection).countDocuments()
      const beforeStatusCount = await db.collection(statusCollection).countDocuments()

      const response = await server.inject({ method: 'POST', url: '/api/v1/callback', payload })

      const afterMetadataCount = await db.collection(metadataCollection).countDocuments()
      const afterOutboxCount = await db.collection(outboxCollection).countDocuments()
      const afterStatusCount = await db.collection(statusCollection).countDocuments()

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
      expect(afterMetadataCount - beforeMetadataCount).toBe(0) // Rejected files should NOT create metadata entries
      expect(afterOutboxCount - beforeOutboxCount).toBe(0) // Rejected files should NOT create outbox entries
      expect(afterStatusCount - beforeStatusCount).toBe(1) // Should create status record for validation failure

      // Verify no metadata was persisted
      const persisted = await db.collection(metadataCollection).findOne({ 'metadata.submissionId': payload.metadata.submissionId })
      expect(persisted).toBeNull()

      // Verify status record shows validation failure
      const statusRecord = await db.collection(statusCollection).findOne({ fileId: minimalRejected.fileId })
      expect(statusRecord).toBeDefined()
      expect(statusRecord.validated).toBe(false)
      expect(statusRecord.errors).toBeInstanceOf(Array)
    })

    test('should return 201 for rejected file missing errorMessage', async () => {
      const payload = JSON.parse(JSON.stringify(mockScanAndUploadResponseSingleFile))
      const minimalRejectedMissingError = {
        fileId: '550e8400-e29b-41d4-a716-446655440002',
        filename: 'rejected-no-msg.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'rejected',
        hasError: true
      }
      payload.form = { 'rejected-file': minimalRejectedMissingError }
      payload.metadata = { ...payload.metadata, submissionId: `rejected-missing-msg-${Date.now()}` }

      const beforeMetadataCount = await db.collection(metadataCollection).countDocuments()
      const beforeOutboxCount = await db.collection(outboxCollection).countDocuments()

      const response = await server.inject({ method: 'POST', url: '/api/v1/callback', payload })

      const afterMetadataCount = await db.collection(metadataCollection).countDocuments()
      const afterOutboxCount = await db.collection(outboxCollection).countDocuments()

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
      expect(afterMetadataCount - beforeMetadataCount).toBe(0)
      expect(afterOutboxCount - beforeOutboxCount).toBe(0)

      const fileId = Object.values(payload.form)[0].fileId
      const statusRecords = await db.collection(statusCollection).find({ fileId }).toArray()
      expect(statusRecords.length).toBeGreaterThanOrEqual(1)
      statusRecords.forEach(sr => {
        expect(sr.validated).toBe(false)
        expect(sr.errors).toBeInstanceOf(Array)
      })
    })

    test('should reject pending file status (persist validation-failure)', async () => {
      const payload = JSON.parse(JSON.stringify(mockScanAndUploadResponseSingleFile))
      const minimalPending = {
        fileId: '550e8400-e29b-41d4-a716-446655440010',
        filename: 'maybe.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'pending'
      }
      payload.form = { 'pending-file': minimalPending }
      payload.metadata = { ...payload.metadata, submissionId: `pending-${Date.now()}` }

      const beforeMetadataCount = await db.collection(metadataCollection).countDocuments()
      const beforeOutboxCount = await db.collection(outboxCollection).countDocuments()

      const response = await server.inject({ method: 'POST', url: '/api/v1/callback', payload })

      const afterMetadataCount = await db.collection(metadataCollection).countDocuments()
      const afterOutboxCount = await db.collection(outboxCollection).countDocuments()

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED) // Handler returns 201 for validation failures
      expect(afterMetadataCount - beforeMetadataCount).toBe(0)
      expect(afterOutboxCount - beforeOutboxCount).toBe(0)

      const fileId = Object.values(payload.form)[0].fileId
      const statusRecords = await db.collection(statusCollection).find({ fileId }).toArray()
      expect(statusRecords.length).toBeGreaterThanOrEqual(1)
      statusRecords.forEach(sr => {
        expect(sr.validated).toBe(false)
        expect(sr.errors).toBeInstanceOf(Array)
      })
    })
  })

  test('should treat mixed status submission as validation failure', async () => {
    const payload = JSON.parse(JSON.stringify(mockScanAndUploadResponse))

    // Create multiple files with different statuses - handler will fail on first non-complete file
    payload.form = {
      'complete-file': {
        fileId: '550e8400-e29b-41d4-a716-446655440020',
        filename: 'valid.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'complete',
        contentLength: 12345,
        checksumSha256: 'abc123==',
        s3Key: 'scanned/complete-file',
        s3Bucket: 'test-bucket'
      },
      'rejected-file': {
        fileId: '550e8400-e29b-41d4-a716-446655440021',
        filename: 'infected.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        fileStatus: 'rejected',
        hasError: true,
        errorMessage: 'Virus detected'
      }
    }
    payload.metadata = { ...payload.metadata, submissionId: `mixed-status-${Date.now()}` }

    const beforeMetadataCount = await db.collection(metadataCollection).countDocuments()
    const beforeOutboxCount = await db.collection(outboxCollection).countDocuments()
    const beforeStatusCount = await db.collection(statusCollection).countDocuments()

    const response = await server.inject({ method: 'POST', url: '/api/v1/callback', payload })

    const afterMetadataCount = await db.collection(metadataCollection).countDocuments()
    const afterOutboxCount = await db.collection(outboxCollection).countDocuments()
    const afterStatusCount = await db.collection(statusCollection).countDocuments()

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
    expect(afterMetadataCount - beforeMetadataCount).toBe(0) // No metadata persisted due to validation failure
    expect(afterOutboxCount - beforeOutboxCount).toBe(0) // No outbox entries due to validation failure
    expect(afterStatusCount - beforeStatusCount).toBeGreaterThanOrEqual(1) // Status records for validation failure

    // Verify validation failure status records were created
    const statusRecords = await db.collection(statusCollection).find({
      $or: [
        { fileId: '550e8400-e29b-41d4-a716-446655440020' },
        { fileId: '550e8400-e29b-41d4-a716-446655440021' }
      ]
    }).toArray()
    expect(statusRecords.length).toBeGreaterThanOrEqual(1)
    statusRecords.forEach(sr => {
      expect(sr.validated).toBe(false)
      expect(sr.errors).toBeInstanceOf(Array)
    })
  })
})

describe('with an invalid payload', async () => {
  test('should return 201 for missing required fields', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: {}
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
  })

  test('should persist status records only when validation fails', async () => {
    const submissionId = `invalid-submission-${Date.now()}`

    const invalidPayload = {
      ...mockScanAndUploadResponse,
      metadata: {
        ...mockScanAndUploadResponse.metadata,
        submissionId,
        crn: '12345' // Invalid type to trigger validation failure
      }
    }

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: invalidPayload
    })

    const metadataRecords = await db.collection(metadataCollection)
      .find({ 'metadata.submissionId': submissionId })
      .toArray()

    const outboxRecords = await db.collection(outboxCollection)
      .find({ 'payload.metadata.submissionId': submissionId })
      .toArray()

    const statusRecords = await db.collection(statusCollection)
      .find({ sbi: mockScanAndUploadResponse.metadata.sbi, validated: false })
      .sort({ timestamp: -1 })
      .limit(2)
      .toArray()

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
    expect(metadataRecords).toHaveLength(0)
    expect(outboxRecords).toHaveLength(0)

    expect(statusRecords).toHaveLength(2)
    statusRecords.forEach((status) => {
      expect(status.validated).toBe(false)
      expect(status.errors).toBeInstanceOf(Array)
      expect(status.errors.length).toBeGreaterThan(0)
    })
  })

  test('should return 201 for invalid metadata.sbi format', async () => {
    const invalidPayload = {
      ...mockScanAndUploadResponse,
      metadata: {
        ...mockScanAndUploadResponse.metadata,
        sbi: '12345' // Should be 9 digits
      }
    }

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: invalidPayload
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
    expect(response.result.message).toContain('Validation failure persisted')
  })

  test('should return 201 for invalid metadata.crn format', async () => {
    const invalidPayload = {
      ...mockScanAndUploadResponse,
      metadata: {
        ...mockScanAndUploadResponse.metadata,
        crn: '123' // Should be 10 digits
      }
    }

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: invalidPayload
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
    expect(response.result.message).toContain('Validation failure persisted')
  })

  test('should return 201 for invalid file upload fileId', async () => {
    const invalidPayload = {
      ...mockScanAndUploadResponse,
      form: {
        'test-file': {
          ...mockScanAndUploadResponse.form['a-file-upload-field'],
          fileId: 'not-a-uuid'
        }
      }
    }

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: invalidPayload
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
    expect(response.result.message).toContain('Validation failure persisted')
  })

  test('should return 201 for unknown fields (strict mode)', async () => {
    const invalidPayload = {
      ...mockScanAndUploadResponse,
      unknownField: 'should-fail'
    }

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: invalidPayload
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
    expect(response.result.message).toContain('Validation failure persisted')
  })

  test('should return 201 with multiple validation errors', async () => {
    const invalidPayload = {
      uploadStatus: 'invalid-status',
      metadata: {
        sbi: '123', // Invalid format
        crn: 'abc' // Invalid format
        // Missing other required fields
      },
      form: {}
    }

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: invalidPayload
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
    expect(response.result.message).toContain('Validation failure persisted')
  })
})

describe('MIME type validation (contentType and detectedContentType)', async () => {
  describe('should accept valid MIME types', async () => {
    const validMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/plain',
      'video/mp4',
      'audio/mpeg',
      // MIME types with plus signs
      'application/ld+json',
      'image/svg+xml',
      'application/atom+xml',
      'application/hal+json',
      // MIME types with dots (vendor types)
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.api+json',
      'application/vnd.oasis.opendocument.text',
      // MIME types with hyphens
      'application/x-www-form-urlencoded',
      'application/x-pkcs7-signature',
      'application/pkcs7-mime',
      'text/x-markdown',
      // MIME types with numbers
      'video/3gpp',
      'video/3gpp2',
      'audio/mp4',
      'application/x-7z-compressed',
      'application/vnd.3gpp.pic-bw-small',
      // MIME types with multiple special characters
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/x-pkcs12',
      // MIME types with allowed special characters (!, #, $, &, ^, _)
      'application/test!type',
      'application/test#type',
      'application/test$type',
      'application/test&type',
      'application/test^type',
      'application/test_type'
    ]

    validMimeTypes.forEach((mimeType) => {
      test(`should accept ${mimeType}`, async () => {
        const payload = {
          ...mockScanAndUploadResponse,
          form: {
            'test-field': {
              ...mockScanAndUploadResponse.form['a-file-upload-field'],
              contentType: mimeType,
              detectedContentType: mimeType
            }
          }
        }

        const response = await server.inject({
          method: 'POST',
          url: '/api/v1/callback',
          payload
        })

        expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
      })
    })
  })

  describe('should reject invalid MIME types', async () => {
    const invalidMimeTypes = [
      { value: 'applicationpdf', reason: 'missing slash' },
      { value: '/pdf', reason: 'starts with slash' },
      { value: 'application/', reason: 'ends with slash' },
      { value: 'application//pdf', reason: 'double slash' },
      { value: '-application/pdf', reason: 'starts with hyphen' },
      { value: '.application/pdf', reason: 'starts with dot' },
      { value: '+application/pdf', reason: 'starts with plus' },
      { value: 'application/ pdf', reason: 'contains space after slash' },
      { value: 'application /pdf', reason: 'contains space before slash' },
      { value: 'application/pdf test', reason: 'contains space in subtype' },
      { value: 'application@pdf', reason: 'contains invalid character @' },
      { value: 'application/pdf*test', reason: 'contains invalid character *' },
      { value: 'application/pdf(test)', reason: 'contains invalid characters ()' },
      { value: 'application/pdf[test]', reason: 'contains invalid characters []' },
      { value: '', reason: 'empty string' },
      { value: '/', reason: 'only slash' },
      { value: 'application', reason: 'missing subtype' },
      { value: '/application/pdf', reason: 'extra leading slash' },
      { value: 'application/pdf/', reason: 'trailing slash' },
      { value: 'application\\pdf', reason: 'backslash instead of slash' },
      { value: 'application:pdf', reason: 'colon instead of slash' }
    ]

    invalidMimeTypes.forEach(({ value, reason }) => {
      test(`should reject "${value}" (${reason})`, async () => {
        const payload = {
          ...mockScanAndUploadResponse,
          form: {
            'test-field': {
              ...mockScanAndUploadResponse.form['a-file-upload-field'],
              contentType: value
            }
          }
        }

        const response = await server.inject({
          method: 'POST',
          url: '/api/v1/callback',
          payload
        })

        expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
        expect(response.result.message).toContain('Validation failure persisted')
      })
    })

    test('should reject invalid detectedContentType', async () => {
      const payload = {
        ...mockScanAndUploadResponse,
        form: {
          'test-field': {
            ...mockScanAndUploadResponse.form['a-file-upload-field'],
            detectedContentType: 'invalid-mime-type'
          }
        }
      }

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
      expect(response.result.message).toContain('Validation failure persisted')
    })
  })
})

describe('regression tests', async () => {
  test('should still accept valid payloads after validation changes', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: mockScanAndUploadResponse
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
    expect(response.result).toHaveProperty('message', 'Metadata created')
    expect(response.result).toHaveProperty('count')
    expect(response.result).toHaveProperty('ids')
  })
})

describe('when the database fails to store the document', async () => {
  test('should return a 500 status code and insert error message', async () => {
    const mockInsertOne = vi.fn().mockResolvedValue({ acknowledged: false })
    // Simulate failure for insertMany (metadata persistence) to trigger 500
    const dbSpy = vi.spyOn(db, 'collection').mockReturnValue({
      insertOne: mockInsertOne,
      insertMany: vi.fn().mockResolvedValue({ acknowledged: false }),
      updateMany: vi.fn().mockResolvedValue({ acknowledged: true })
    })

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanAndUploadResponse
      })
      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      expect(response.result.message).toBe('An internal server error occurred')
    } finally {
      dbSpy.mockRestore()
    }
  })
})

describe('when the database is unavailable', async () => {
  test('should return a 500 status code and database unavailable message', async () => {
    const dbError = vi.fn().mockRejectedValue(new Error('Database unavailable'))
    const dbSpy = vi.spyOn(db, 'collection').mockReturnValue({
      insertOne: dbError,
      insertMany: dbError,
      updateMany: dbError
    })

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanAndUploadResponse
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      expect(response.result.error).toBe('Internal Server Error')
      expect(response.result.message).toBe('An internal server error occurred')
    } finally {
      dbSpy.mockRestore()
    }
  })
})
