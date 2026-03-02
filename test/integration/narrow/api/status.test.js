import { randomUUID } from 'node:crypto'
import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { db } from '../../../../src/data/db.js'
import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'

let server
let originalCollection
let collection

const createMockStatusRecord = (correlationId, overrides = {}) => ({
  correlationId,
  sbi: 105000000,
  fileId: randomUUID(),
  timestamp: new Date(),
  validated: true,
  errors: null,
  ...overrides
})

beforeAll(async () => {
  vi.restoreAllMocks()
  originalCollection = config.get('mongo.collections.status')
  config.set('mongo.collections.status', 'test-status-api-collection')
  collection = config.get('mongo.collections.status')
})

beforeEach(async () => {
  await db.collection(collection).deleteMany({})
})

afterAll(async () => {
  vi.restoreAllMocks()
  await db.collection(collection).deleteMany({})
  config.set('mongo.collections.status', originalCollection)
})

describe('GET to the /api/v1/status/{correlationId} route', async () => {
  server = await createServer()
  await server.initialize()

  describe('with a valid correlationId that has records', () => {
    test('should return array of status records', async () => {
      const correlationId = randomUUID()
      const records = [
        createMockStatusRecord(correlationId, {
          fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
          timestamp: new Date('2026-02-26T10:00:00Z')
        }),
        createMockStatusRecord(correlationId, {
          fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554',
          timestamp: new Date('2026-02-26T10:01:00Z')
        }),
        createMockStatusRecord(correlationId, {
          fileId: '693db079-f82b-4bbc-87e9-86d822cc0bad',
          timestamp: new Date('2026-02-26T10:02:00Z')
        })
      ]

      await db.collection(collection).insertMany(records)

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/status/${correlationId}`
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      expect(response.result.data).toHaveLength(3)
      expect(response.result.data.every(r => r.correlationId === correlationId)).toBe(true)
    })

    test('should return records sorted by timestamp ascending', async () => {
      const correlationId = randomUUID()
      const records = [
        createMockStatusRecord(correlationId, {
          timestamp: new Date('2026-02-26T10:03:00Z'),
          fileId: randomUUID()
        }),
        createMockStatusRecord(correlationId, {
          timestamp: new Date('2026-02-26T10:01:00Z'),
          fileId: randomUUID()
        }),
        createMockStatusRecord(correlationId, {
          timestamp: new Date('2026-02-26T10:02:00Z'),
          fileId: randomUUID()
        })
      ]

      await db.collection(collection).insertMany(records)

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/status/${correlationId}`
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      const timestamps = response.result.data.map(r => new Date(r.timestamp).getTime())
      expect(timestamps[0]).toBeLessThan(timestamps[1])
      expect(timestamps[1]).toBeLessThan(timestamps[2])
    })

    test('should return mix of validated and failed records', async () => {
      const correlationId = randomUUID()
      const records = [
        createMockStatusRecord(correlationId, {
          validated: true,
          errors: null,
          timestamp: new Date('2026-02-26T10:00:00Z')
        }),
        createMockStatusRecord(correlationId, {
          validated: false,
          errors: [
            { field: 'metadata.crn', errorType: 'any.required', receivedValue: 'must-be-a-valid-value' }
          ],
          timestamp: new Date('2026-02-26T10:01:00Z')
        })
      ]

      await db.collection(collection).insertMany(records)

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/status/${correlationId}`
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      expect(response.result.data).toHaveLength(2)

      const validatedRecord = response.result.data.find(r => r.validated === true)
      const failedRecord = response.result.data.find(r => r.validated === false)

      expect(validatedRecord.errors).toBeNull()
      expect(failedRecord.errors).toHaveLength(1)
      expect(failedRecord.errors[0].field).toBe('metadata.crn')
    })
  })

  describe('with a valid correlationId that has no records', () => {
    test('should return 200 with empty array', async () => {
      const correlationId = randomUUID()

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/status/${correlationId}`
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      expect(response.result.data).toEqual([])
    })
  })

  describe('with an invalid correlationId', () => {
    test('should return 400 for non-UUID string', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/status/not-a-uuid'
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
      expect(response.result.error).toBe('Bad Request')
      expect(response.result.message).toBe('The correlationId must be a valid UUID v4.')
    })

    test('should return 400 for numeric value', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/status/12345'
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
    })
  })

  describe('when the db is unavailable', () => {
    test('should return 500 server error', async () => {
      await db.client.close()

      const errorServer = await createServer()
      const correlationId = randomUUID()
      const response = await errorServer.inject({
        method: 'GET',
        url: `/api/v1/status/${correlationId}`
      })

      expect(response.result.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      expect(response.result.error).toBe('Internal Server Error')
      expect(response.result.message).toBe('An internal server error occurred')

      await db.client.connect() // reconnect to allow test clean up
    })
  })
})
