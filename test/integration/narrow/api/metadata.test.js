import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../../../src/api'
import { mockMetadataPayload } from '../../../mocks/metadata.js'
import { config } from '../../../../src/config/index.js'
import db from '../../../../src/data/db.js'

let server
let originalCollection
let collection

beforeAll(async () => {
  vi.restoreAllMocks()
  originalCollection = config.get('mongo.collections.uploadMetadata')
  config.set('mongo.collections.uploadMetadata', 'metadata-test-collection')
  collection = config.get('mongo.collections.uploadMetadata')
  await db.collection(collection).deleteMany({})
})
// do i need this repeated in the before and after?
afterAll(async () => {
  vi.restoreAllMocks()
  await db.collection(collection).deleteMany({})
  config.set('mongo.collections.uploadMetadata', originalCollection)
})

describe('GET to the /metadata route', async () => {
  server = await createServer()
  await server.initialize()

  describe('when there is valid data in the database', async () => {
    test('should return an array of metadata objects when one document found', async () => {
      await db.collection(collection).insertOne(mockMetadataPayload)
      const sbi = '105000001'

      const response = await server.inject({
        method: 'GET',
        url: `/metadata/${sbi}`,
      })

      expect(response.result.data).toBeInstanceOf(Array)
      expect(response.result.status).toBe(httpConstants.HTTP_STATUS_OK)
      expect(response.result.data).toStrictEqual([mockMetadataPayload])
    })

    // test('should return an array of metadata objects when multiple documents found', async () => {
    //   const sbi = '105000000'
    //   const response = await server.inject({
    //     method: 'GET',
    //     url: `/metadata/${sbi}`,
    //   })
    //   expect(response.result.data).toBeInstanceOf(Array)
    //   expect(response.result.status).toBe(httpConstants.HTTP_STATUS_OK)
    //   expect(response.result.data).toStrictEqual([mockMetadataPayload])
    // })
  })
})
