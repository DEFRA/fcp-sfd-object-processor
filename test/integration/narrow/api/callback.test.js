import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterAll } from 'vitest'

import { db } from '../../../../src/data/db.js'
import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'
import { mockScanAndUploadResponse } from '../../../mocks/cdp-uploader.js'

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

afterAll(async () => {
  // test cleanup
  vi.restoreAllMocks()
  await db.collection(metadataCollection).deleteMany({})
  await db.collection(outboxCollection).deleteMany({})
  await db.collection(statusCollection).deleteMany({})

  config.set('mongo.collections.uploadMetadata', originalMetadataCollection)
  config.set('mongo.collections.outbox', originalOutboxCollection)
  config.set('mongo.collections.status', originalStatusCollection)
})

describe('POST to the /api/v1/callback route', async () => {
  server = await createServer()
  await server.initialize()

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

  describe('with an invalid payload', async () => {
    test('should return 422 for missing required fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: {}
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(response.result.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(response.result.error).toBe('Unprocessable Entity')
      expect(response.result.message).toContain('"uploadStatus" is required')
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

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(metadataRecords).toHaveLength(0)
      expect(outboxRecords).toHaveLength(0)

      expect(statusRecords).toHaveLength(2)
      statusRecords.forEach((status) => {
        expect(status.validated).toBe(false)
        expect(status.errors).toBeInstanceOf(Array)
        expect(status.errors.length).toBeGreaterThan(0)
      })
    })

    test('should return 422 for invalid metadata.sbi format', async () => {
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

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(response.result.message).toContain('sbi')
    })

    test('should return 422 for invalid metadata.crn format', async () => {
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

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(response.result.message).toContain('crn')
    })

    test('should return 422 for invalid file upload fileId', async () => {
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

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(response.result.message).toContain('fileId')
    })

    test('should return 422 for unknown fields (strict mode)', async () => {
      const invalidPayload = {
        ...mockScanAndUploadResponse,
        unknownField: 'should-fail'
      }

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: invalidPayload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(response.result.message).toContain('unknownField')
    })

    test('should return 422 with multiple validation errors', async () => {
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

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(response.result.message).toContain('"uploadStatus" must be one of [ready, initiated, pending]')
      expect(response.result.message).toContain('sbi')
      expect(response.result.message).toContain('crn')
      expect(response.result.message).toContain('"form" must contain at least one file upload')
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

          expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
          expect(response.result.message).toContain('contentType')
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

        expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
        expect(response.result.message).toContain('detectedContentType')
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
      vi.spyOn(db, 'collection').mockReturnValue({ insertOne: mockInsertOne })

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanAndUploadResponse
      })
      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      expect(response.result.message).toBe('An internal server error occurred')
    })
  })

  describe('when the database is unavailable', async () => {
    test('should return a 500 status code and database unavailable message', async () => {
      const dbError = vi.fn().mockRejectedValue(new Error('Database unavailable'))
      vi.spyOn(db, 'collection').mockReturnValue({ insertOne: dbError })

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanAndUploadResponse
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      expect(response.result.error).toBe('Internal Server Error')
      expect(response.result.message).toBe('An internal server error occurred')
    })
  })
})
