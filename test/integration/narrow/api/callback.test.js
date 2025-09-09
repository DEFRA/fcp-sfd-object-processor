import { constants as httpConstants } from 'node:http2'
import { describe, test, expect, beforeEach, beforeAll } from 'vitest'
import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'
import db from '../../../../src/data/db.js'

let server

describe('POST to the /callback route', async () => {
  const collection = config.get('mongo.collections.uploadMetadata')

  server = await createServer()
  await server.initialize()

  beforeEach(async () => {
    await db.collection(collection).deleteMany({})
  })

  describe('with a valid payload', async () => {
    test('should save a document into the collection', async () => {
      await server.inject({
        method: 'POST',
        url: '/callback',
        payload: {}
      })
      const numberOfRecords = await db.collection(collection).countDocuments({})

      expect(numberOfRecords).toBeDefined()
      expect(numberOfRecords).toBe(1)
    })
  })
})
