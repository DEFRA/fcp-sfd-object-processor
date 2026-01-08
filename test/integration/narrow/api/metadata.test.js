import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { createServer } from '../../../../src/api'
import { mockMetadataResponse } from '../../../mocks/metadata.js'
import { config } from '../../../../src/config/index.js'
import db from '../../../../src/data/db.js'

let server
let originalCollection
let collection

// should be inserting the RAW metadata object including the 'raw' and 's3' keys to test that it successfully filters

beforeAll(async () => {
  // set a new collection for each integration test to avoid db clashes between tests
  vi.restoreAllMocks()
  originalCollection = config.get('mongo.collections.uploadMetadata')
  config.set('mongo.collections.uploadMetadata', 'metadata-test-collection')
  collection = config.get('mongo.collections.uploadMetadata')
  await db.collection(collection).deleteMany({})
})

afterEach(async () => {
  await db.collection(collection).deleteMany({})
})

afterAll(async () => {
  // test cleanup
  vi.restoreAllMocks()
  config.set('mongo.collections.uploadMetadata', originalCollection)
})

describe('GET to the /api/v1/metadata/sbi route', async () => {
  server = await createServer()
  await server.initialize()

  describe('when there is valid data in the database', async () => {
    test('should return an array of metadata objects when one document found', async () => {
      await db.collection(collection).insertOne(mockMetadataResponse[0])
      const sbi = '105000000'

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/metadata/sbi/${sbi}`
      })

      expect(response.result.data).toBeInstanceOf(Array)
      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      expect(response.result.data[0]).toStrictEqual({
        _id: expect.anything(),
        ...mockMetadataResponse[0]
      })
    })

    test('should return an array of metadata objects when multiple documents found', async () => {
      await db.collection(collection).insertMany(mockMetadataResponse)

      const sbi = '105000000'
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/metadata/sbi/${sbi}`
      })

      expect(response.result.data).toBeInstanceOf(Array)
      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      expect(response.result.data.length).toBe(2)
      expect(response.result.data).toStrictEqual([{
        _id: expect.anything(),
        ...mockMetadataResponse[0]
      },
      {
        _id: expect.anything(),
        ...mockMetadataResponse[1]
      }])
    })

    test('should return null and 404 status when no documents found', async () => {
      await db.collection(collection).insertMany(mockMetadataResponse)

      const sbi = '123456789'
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/metadata/sbi/${sbi}`
      })

      expect(response.result.statusCode).toBe(httpConstants.HTTP_STATUS_NOT_FOUND)
      expect(response.result.error).toBe('Not Found')
      expect(response.result.message).toBe('No documents found')
    })

    test('should return 400 bad request when invalid sbi used', async () => {
      await db.collection(collection).insertMany(mockMetadataResponse)

      const sbi = 'not-an-sbi'
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/metadata/sbi/${sbi}`
      })

      expect(response.result.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
      expect(response.result.error).toBe('Bad Request')
      expect(response.result.message).toBe('Invalid SBI format')
    })

    test('should return 500 server error when db is unavailable', async () => {
      await db.client.close()

      const errorServer = await createServer()
      const sbi = '123456789'
      const response = await errorServer.inject({
        method: 'GET',
        url: `/api/v1/metadata/sbi/${sbi}`
      })

      expect(response.result.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      expect(response.result.error).toBe('Internal Server Error')
      expect(response.result.message).toBe('An internal server error occurred')

      await db.client.connect() // reconnect to allow test clean up
    })
  })
})
