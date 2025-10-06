import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import db from '../../../../src/data/db.js'
import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'
import { mockFormattedMetadata } from '../../../mocks/metadata.js'

let server
let originalCollection
let collection

beforeAll(async () => {
  // set a new collection for each integration test to avoid db clashes between tests
  vi.restoreAllMocks()
  originalCollection = config.get('mongo.collections.uploadMetadata')
  config.set('mongo.collections.uploadMetadata', 'blob-test-collection')
  collection = config.get('mongo.collections.uploadMetadata')
})

beforeEach(async () => {
  await db.collection(collection).deleteMany({})
})

afterAll(async () => {
  // test cleanup
  vi.restoreAllMocks()
  await db.collection(collection).deleteMany({})
  config.set('mongo.collections.uploadMetadata', originalCollection)
})

describe('GET to the /api/v1/blob/{fileId} route', async () => {
  server = await createServer()
  await server.initialize()

  describe('with a valid fileId', async () => {
    const fileId = mockFormattedMetadata.file.fileId
    test('should return the s3Key and s3bucket', async () => {
      await db.collection(collection).insertOne(mockFormattedMetadata)

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/blob/${fileId}`,
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      expect(response.result.data.url).toBeDefined()
      expect(response.result.data.url).toContain(`${mockFormattedMetadata.s3.bucket}/${mockFormattedMetadata.s3.key}`)
    })

    test('should return 404 when no records found', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/blob/${fileId}`,
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_NOT_FOUND)
      expect(response.result.error).toBe('Not Found')
      expect(response.result.message).toBe('No documents found')
    })
  })

  describe('with an invalid fileId', async () => {
    test('should return bad request status when fileid is invalid', async () => {
      const fileId = 'invalid-fileId'
      await db.collection(collection).insertOne(mockFormattedMetadata)

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/blob/${fileId}`,
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
      expect(response.result.error).toBe('Bad Request')
      expect(response.result.message).toBe('The "id" field must be a valid UUID v4.')
    })
  })

  describe('When the db is unavailable', () => {
    test('should return 500 server error', async () => {
      await db.client.close()

      const errorServer = await createServer()
      const fileId = mockFormattedMetadata.file.fileId
      const response = await errorServer.inject({
        method: 'GET',
        url: `/api/v1/blob/${fileId}`,
      })

      expect(response.result.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      expect(response.result.error).toBe('Internal Server Error')
      expect(response.result.message).toBe('An internal server error occurred')

      await db.client.connect() // reconnect to allow test clean up
    })
  })
})
