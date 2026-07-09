import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { db } from '../../../../src/data/db.js'
import { config } from '../../../../src/config'
import { mockFormattedMetadata } from '../../../mocks/metadata.js'
import { assertValidAuditEvent } from '../../../helpers/validate-audit-payload.js'

const capturedAuditEvents = []

vi.mock('@defra/fcp-audit-publisher', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    publishAuditEvent: vi.fn().mockImplementation(async (event, config) => {
      // Simulate what @defra/fcp-audit-publisher does: add required fields
      const enrichedEvent = {
        datetime: new Date().toISOString(),
        version: config?.version || '1.0.0',
        application: config?.application,
        component: config?.component,
        environment: config?.environment,
        ip: config?.ip || '0.0.0.0',
        correlationid: event.correlationid || config?.generateCorrelationId ? crypto.randomUUID() : undefined,
        audit: event.audit
      }
      capturedAuditEvents.push(enrichedEvent)
    })
  }
})

let server
let createServer
let originalCollection
let collection

beforeAll(async () => {
  // set a new collection for each integration test to avoid db clashes between tests
  ; ({ createServer } = await import('../../../../src/api'))
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

describe('GET to the /api/v1/blob/{fileId} route', () => {
  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  describe('with a valid fileId', async () => {
    const fileId = mockFormattedMetadata.file.fileId
    test('should return the s3Key and s3bucket', async () => {
      await db.collection(collection).insertOne(mockFormattedMetadata)

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/blob/${fileId}`
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      expect(response.result.data.url).toBeDefined()
      expect(response.result.data.url).toContain(`${mockFormattedMetadata.s3.bucket}/${mockFormattedMetadata.s3.key}`)
    })

    test('should return 404 when no records found', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/blob/${fileId}`
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
        url: `/api/v1/blob/${fileId}`
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
        url: `/api/v1/blob/${fileId}`
      })

      expect(response.result.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      expect(response.result.error).toBe('Internal Server Error')
      expect(response.result.message).toBe('An internal server error occurred')

      await db.client.connect() // reconnect to allow test clean up
    })
  })
})

describe('GET /api/v1/blob/{fileId} — audit event schema validation', async () => {
  let auditServer

  beforeAll(async () => {
    auditServer = await createServer()
    await auditServer.initialize()
  })

  beforeEach(async () => {
    await db.collection(collection).insertOne(mockFormattedMetadata)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    if (auditServer && typeof auditServer.stop === 'function') {
      await auditServer.stop()
    }
    await db.collection(collection).deleteMany({})
    config.set('mongo.collections.uploadMetadata', originalCollection)
  })

  test('emits schema-valid document/read event without presigned URL', async () => {
    capturedAuditEvents.length = 0
    const fileId = mockFormattedMetadata.file.fileId

    await auditServer.inject({
      method: 'GET',
      url: `/api/v1/blob/${fileId}`
    })

    expect(capturedAuditEvents.length).toBe(1)
    assertValidAuditEvent(capturedAuditEvents[0])
    expect(capturedAuditEvents[0].audit.entities[0].entity).toBe('document')
    expect(capturedAuditEvents[0].audit.entities[0].action).toBe('read')
    expect(capturedAuditEvents[0].audit.status).toBe('success')

    const serialised = JSON.stringify(capturedAuditEvents[0])
    expect(serialised).not.toContain('http')
    expect(serialised).not.toContain('presigned')
  })
})
