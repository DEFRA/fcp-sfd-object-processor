import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeEach, afterAll } from 'vitest'
import { createServer } from '../../../../src/api'
import db from '../../../../src/data/db.js'
import { mockMetadataPayload } from '../../../mocks/metadata.js'
import { config } from '../../../../src/config'

let server
let originalCollection
let collection

beforeEach(async () => {
  originalCollection = config.get('mongo.collections.uploadMetadata')
  config.set('mongo.collections.uploadMetadata', 'callback-test-collection')
  collection = config.get('mongo.collections.uploadMetadata')
  vi.restoreAllMocks()
})

afterAll(async () => {
  vi.restoreAllMocks()
  await db.collection(collection).deleteMany({})
  config.set('mongo.collections.uploadMetadata', originalCollection)
})

describe('POST to the /callback route', async () => {
  server = await createServer()
  await server.initialize()

  describe('with a valid payload', async () => {
    test('should save a document into the collection', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/callback',
        payload: mockMetadataPayload
      })

      const records = await db.collection(collection).find({}).toArray()

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

      expect(records).toBeDefined()
      expect(records.length).toBe(1)
      expect(records[0]).toMatchObject(mockMetadataPayload)
    })
  })

  describe('with an invalid payload', async () => {
    test('should fail validation', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/callback',
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
        url: '/callback',
        payload: mockMetadataPayload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      expect(response.result.message).toBe('Failed to insert document into database.')
    })
  })

  describe('when the database is unavailable', async () => {
    test('should return a 500 status code and database unavailable message', async () => {
      const dbError = vi.fn().mockRejectedValue(new Error('Database unavailable'))
      vi.spyOn(db, 'collection').mockReturnValue({ insertOne: dbError })

      const response = await server.inject({
        method: 'POST',
        url: '/callback',
        payload: mockMetadataPayload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      expect(response.result.error).toBe('Failed to insert document')
      expect(response.result.message).toBe('Unable to complete database operation.')
      expect(response.result.cause).toBe('Database unavailable')
    })
  })
})
