import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterAll } from 'vitest'

import { db } from '../../../../src/data/db.js'
import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'
import { mockScanAndUploadResponse } from '../../../mocks/cdp-uploader.js'
import { mockMetadataResponse } from '../../../mocks/metadata.js'

let server
let originalCollection
let collection

beforeAll(async () => {
  // set a new collection for each integration test to avoid db clashes between tests
  vi.restoreAllMocks()
  originalCollection = config.get('mongo.collections.uploadMetadata')
  config.set('mongo.collections.uploadMetadata', 'callback-test-collection')
  collection = config.get('mongo.collections.uploadMetadata')
  await db.collection(collection).deleteMany({})
})

afterAll(async () => {
  // test cleanup
  vi.restoreAllMocks()
  await db.collection(collection).deleteMany({})
  config.set('mongo.collections.uploadMetadata', originalCollection)
})

describe('POST to the /api/v1/callback route', async () => {
  server = await createServer()
  await server.initialize()

  describe('with a valid payload', async () => {
    test('should save a document into the collection', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanAndUploadResponse
      })

      const records = await db.collection(collection).find({}).toArray()

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

      expect(records).toBeDefined()
      expect(records.length).toBe(2)
      expect(records[0]).toMatchObject(mockMetadataResponse[0])
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
