import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterEach } from 'vitest'
import { createServer } from '../../../../src/api'
import { mockMetadataPayload } from '../../../mocks/metadata.js'
import { config } from '../../../../src/config/index.js'
import db from '../../../../src/data/db.js'

let server

describe('GET to the /metadata route', async () => {
  const collection = config.get('mongo.collections.uploadMetadata')

  server = await createServer()
  await server.initialize()

  beforeAll(async () => {
    vi.restoreAllMocks()
    await db.collection(collection).deleteMany({})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await db.collection(collection).deleteMany({})
  })

  describe('when there is valid data in the database', async () => {
    beforeAll(async () => {
      await db.collection(collection).insertOne(mockMetadataPayload)
    })

    test('should return an array of metadata objects when one document found', async () => {
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
