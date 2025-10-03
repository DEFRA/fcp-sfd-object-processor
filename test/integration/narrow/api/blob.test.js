import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterAll } from 'vitest'

import db from '../../../../src/data/db.js'
import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'
import { mockS3Data, mockFormattedMetadata } from '../../../mocks/metadata.js'

let server
let originalCollection
let collection

beforeAll(async () => {
  // set a new collection for each integration test to avoid db clashes between tests
  vi.restoreAllMocks()
  originalCollection = config.get('mongo.collections.uploadMetadata')
  config.set('mongo.collections.uploadMetadata', 'blob-test-collection')
  collection = config.get('mongo.collections.uploadMetadata')
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
      // presignedUrl should be ${bucket}/${key} ...
    })
  })

  // describe('with an invalid fileId', async () => {
  //   test('should fail validation', async () => {
  //     const response = await server.inject({
  //       method: 'POST',
  //       url: '/api/v1/callback',
  //       payload: {}
  //     })

  //     const mappedErrors = response.result.err.details.map((detail) => detail.message)

  //     expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)

  //     expect(mappedErrors[0]).toBe('"uploadStatus" is required')
  //     expect(mappedErrors[1]).toBe('"metadata" is required')
  //     expect(mappedErrors[2]).toBe('"form" is required')
  //   })
  // })

  // describe('when the database fails to store the document', async () => {
  //   test('should return a 500 status code and insert error message', async () => {
  //     const mockInsertOne = vi.fn().mockResolvedValue({ acknowledged: false })
  //     vi.spyOn(db, 'collection').mockReturnValue({ insertOne: mockInsertOne })

  //     const response = await server.inject({
  //       method: 'POST',
  //       url: '/api/v1/callback',
  //       payload: mockScanAndUploadResponse
  //     })
  //     expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
  //     expect(response.result.message).toBe('An internal server error occurred')
  //   })
  // })

  // describe('when the database is unavailable', async () => {
  //   test('should return a 500 status code and database unavailable message', async () => {
  //     const dbError = vi.fn().mockRejectedValue(new Error('Database unavailable'))
  //     vi.spyOn(db, 'collection').mockReturnValue({ insertOne: dbError })

  //     const response = await server.inject({
  //       method: 'POST',
  //       url: '/api/v1/callback',
  //       payload: mockScanAndUploadResponse
  //     })

  //     expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
  //     expect(response.result.error).toBe('Internal Server Error')
  //     expect(response.result.message).toBe('An internal server error occurred')
  //   })
})
