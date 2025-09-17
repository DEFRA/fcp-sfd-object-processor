import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterEach } from 'vitest'
import { createServer } from '../../../../src/api'
import { mockMetadataPayload } from '../../../mocks/metadata.js'
import db from '../../../../src/data/db.js'

let server

describe('GET to the /metadata route', async () => {
  const collection = 'metadata-test'

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
    await db.collection(collection).insertOne({ mockMetadataPayload })

    test('should return an array of metadata objects', async () => {
      const sbi = '123456789'
      const response = await server.inject({
        method: 'GET',
        url: `/metadata/${sbi}`,
      })
      // console.log(response)
      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      expect(response.result).toBe({
        data: [mockMetadataPayload]
      })
    })
  })
})
