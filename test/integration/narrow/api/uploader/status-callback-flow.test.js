import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterEach, afterAll } from 'vitest'

import { db } from '../../../../../src/data/db.js'
import { config } from '../../../../../src/config/index.js'
import { mockScanAndUploadResponse } from '../../../../mocks/cdp-uploader.js'
import { baseFileUpload1, baseFileUpload2 } from '../../../../mocks/base-data.js'

const { mockHttpClient } = vi.hoisted(() => ({ mockHttpClient: vi.fn() }))

vi.mock('../../../../../src/http/client.js', () => ({
    httpClient: mockHttpClient,
    TimeoutError: class TimeoutError extends Error {
        constructor(msg) { super(msg); this.name = 'TimeoutError' }
    },
    NetworkError: class NetworkError extends Error { },
    AbortError: class AbortError extends Error { }
}))

let server
let createServer
let originalMetadataCollection
let originalOutboxCollection
let originalStatusCollection
let metadataCollection
let outboxCollection
let statusCollection

const validUploadId = '9fcaabe5-77ec-44db-8356-3a6e8dc51b13'

// This test exercises the real callback + status routes end-to-end against the
// database, only stubbing the outbound CDP Uploader status call.
beforeAll(async () => {
    ; ({ createServer } = await import('../../../../../src/api/index.js'))
    vi.restoreAllMocks()

    originalMetadataCollection = config.get('mongo.collections.uploadMetadata')
    originalOutboxCollection = config.get('mongo.collections.outbox')
    originalStatusCollection = config.get('mongo.collections.status')

    config.set('mongo.collections.uploadMetadata', 'status-callback-flow-test-collection')
    config.set('mongo.collections.outbox', 'status-callback-flow-test-outbox-collection')
    config.set('mongo.collections.status', 'status-callback-flow-test-status-collection')

    metadataCollection = config.get('mongo.collections.uploadMetadata')
    outboxCollection = config.get('mongo.collections.outbox')
    statusCollection = config.get('mongo.collections.status')

    await db.collection(metadataCollection).deleteMany({})
    await db.collection(outboxCollection).deleteMany({})
    await db.collection(statusCollection).deleteMany({})

    server = await createServer()
    await server.initialize()
})

afterEach(async () => {
    vi.restoreAllMocks()
    mockHttpClient.mockReset()
    await db.collection(metadataCollection).deleteMany({})
    await db.collection(outboxCollection).deleteMany({})
    await db.collection(statusCollection).deleteMany({})
})

afterAll(async () => {
    vi.restoreAllMocks()
    await db.collection(metadataCollection).deleteMany({})
    await db.collection(outboxCollection).deleteMany({})
    await db.collection(statusCollection).deleteMany({})
    config.set('mongo.collections.uploadMetadata', originalMetadataCollection)
    config.set('mongo.collections.outbox', originalOutboxCollection)
    config.set('mongo.collections.status', originalStatusCollection)
    await server.stop()
})

describe('callback validation failure followed by a status check', () => {
    test('status request for the same upload does not report success', async () => {
        const uploadRef = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789'

        const invalidPayload = {
            ...mockScanAndUploadResponse,
            metadata: {
                ...mockScanAndUploadResponse.metadata,
                uploadRef,
                crn: '12345' // invalid type — triggers Joi schema validation failure
            }
        }

        const callbackResponse = await server.inject({
            method: 'POST',
            url: '/api/v1/callback',
            payload: invalidPayload
        })

        expect(callbackResponse.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
        expect(callbackResponse.result.message).toContain('Validation failure persisted')

        const persistedStatus = await db.collection(statusCollection).findOne({ uploadRef })
        expect(persistedStatus).toBeDefined()
        expect(persistedStatus.validated).toBe(false)

        mockHttpClient.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                uploadStatus: 'ready',
                metadata: { ...invalidPayload.metadata },
                form: { 'a-file-upload-field': baseFileUpload1 },
                numberOfRejectedFiles: 0
            })
        })

        const statusResponse = await server.inject({
            method: 'GET',
            url: `/api/v1/uploader/status/${validUploadId}`
        })

        expect(statusResponse.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
        expect(statusResponse.result.data.uploadStatus).not.toBe('success')
        expect(statusResponse.result.data.uploadStatus).toBe('failure')
        expect(statusResponse.result.data.stage).toBe('rejected-by-processor')
    })
})

describe('clean upload followed by a status check', () => {
    test('status request for the same upload reports success (no regression)', async () => {
        const uploadRef = 'b2c3d4e5-f6a7-4890-bcde-f01234567890'

        const validPayload = {
            ...mockScanAndUploadResponse,
            metadata: {
                ...mockScanAndUploadResponse.metadata,
                uploadRef,
                submissionId: `clean-submission-${Date.now()}`
            }
        }

        const callbackResponse = await server.inject({
            method: 'POST',
            url: '/api/v1/callback',
            payload: validPayload
        })

        expect(callbackResponse.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

        const persistedStatuses = await db.collection(statusCollection).find({ uploadRef }).toArray()
        expect(persistedStatuses.length).toBeGreaterThan(0)
        persistedStatuses.forEach(record => expect(record.validated).toBe(true))

        mockHttpClient.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                uploadStatus: 'ready',
                metadata: { ...validPayload.metadata },
                form: {
                    'a-file-upload-field': baseFileUpload1,
                    'another-file-upload-field': baseFileUpload2
                },
                numberOfRejectedFiles: 0
            })
        })

        const statusResponse = await server.inject({
            method: 'GET',
            url: `/api/v1/uploader/status/${validUploadId}`
        })

        expect(statusResponse.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
        expect(statusResponse.result.data.uploadStatus).toBe('success')
        expect(statusResponse.result.data.stage).toBe('accepted')
    })
})
