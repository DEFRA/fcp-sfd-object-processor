import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { db } from '../../../../src/data/db.js'
import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'
import { mockFormattedMetadata } from '../../../mocks/metadata.js'

let server
let originalCollection
let collection

beforeAll(async () => {
  // Auth is disabled by default for tests.
  // This test file explicitly enables auth to test authentication behavior.
  config.set('auth.enabled', true)

  vi.restoreAllMocks()
  // set a new collection for each integration test to avoid db clashes between tests
  originalCollection = config.get('mongo.collections.uploadMetadata')
  config.set('mongo.collections.uploadMetadata', 'auth-test-collection')
  collection = config.get('mongo.collections.uploadMetadata')

  server = await createServer()
  await server.initialize()

  await db.collection(collection).insertOne(mockFormattedMetadata)
})

afterAll(async () => {
  config.set('auth.enabled', false) // restore default
})

describe('Authentication across all routes', () => {
  describe('Protected routes must require auth: /blobs, /metadata', () => {
    const routes = [
      { method: 'GET', url: `/api/v1/blob/${mockFormattedMetadata.file.fileId}` },
      { method: 'GET', url: `/api/v1/metadata/sbi/${mockFormattedMetadata.metadata.sbi}` }
    ]

    test.each(routes)('$method $url returns 401 when no auth header is present', async ({ method, url }) => {
      const response = await server.inject({
        method,
        url
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNAUTHORIZED)
      expect(response.result.error).toBe('Unauthorized')
      expect(response.result.message).toBe('Missing authentication')
    })

    // test.each(routes)('$method $url returns 403 when auth token is present but is wrong security group. ', async ({ method, url }) => {
    // })

    // returns 200 when auth is enabled and valid token provided
  })
})

// describe('and the auth token is valid', () => {
// })
