import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterAll } from 'vitest'

import db from '../../../../src/data/db.js'
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
    test('should fail validation', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: {}
      })

      const mappedErrors = response.result.err.details.map((detail) => detail.message)

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)

      expect(mappedErrors[0]).toBe('"uploadStatus" is required')
      expect(mappedErrors[1]).toBe('"metadata" is required')
      expect(mappedErrors[2]).toBe('"form" is required')
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
