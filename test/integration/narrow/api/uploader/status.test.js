import { constants as httpConstants } from 'node:http2'
import { randomUUID } from 'node:crypto'
import { vi, describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest'

import { createServer } from '../../../../../src/api/index.js'
import { db } from '../../../../../src/data/db.js'
import { config } from '../../../../../src/config/index.js'
import { PERMANENT_FAILURE } from '../../../../../src/constants/outbox.js'

const { mockHttpClient } = vi.hoisted(() => ({ mockHttpClient: vi.fn() }))

vi.mock('../../../../../src/http/client.js', () => ({
  httpClient: mockHttpClient,
  TimeoutError: class TimeoutError extends Error {
    constructor (msg) { super(msg); this.name = 'TimeoutError' }
  },
  NetworkError: class NetworkError extends Error { },
  AbortError: class AbortError extends Error { }
}))

const { TimeoutError } = await import('../../../../../src/http/client.js')

let server
const validUploadId = '9fcaabe5-77ec-44db-8356-3a6e8dc51b13'
let originalSessionsCollection
let originalStatusCollection
let originalMetadataCollection
let originalOutboxCollection
let sessionsCollection
let statusCollection
let metadataCollection
let outboxCollection

const completeFile = {
  fileId: 'a0b1c2d3-e4f5-4789-abcd-ef0123456789',
  filename: 'document.pdf',
  contentType: 'application/pdf',
  detectedContentType: 'application/pdf',
  fileStatus: 'complete',
  contentLength: 1024,
  checksumSha256: 'SGVsbG8gV29ybGQ=',
  s3Key: 'scanned/folder/a0b1c2d3-e4f5-4789-abcd-ef0123456789',
  s3Bucket: 'test-bucket'
}

const pendingFile = {
  fileId: 'b1c2d3e4-f5a6-4789-abcd-ef0123456789',
  filename: 'document.pdf',
  contentType: 'application/pdf',
  detectedContentType: 'application/pdf',
  fileStatus: 'pending'
}

const rejectedFile = {
  fileId: 'c2d3e4f5-a6b7-4789-abcd-ef0123456789',
  filename: 'virus.pdf',
  contentType: 'application/pdf',
  fileStatus: 'rejected',
  hasError: true,
  errorMessage: 'File rejected: virus detected'
}

const validMetadata = {
  sbi: 105000000,
  crn: 1050000000,
  frn: 1102658375,
  submissionId: '1733826312',
  type: 'CS_Agreement_Evidence',
  reference: 'user entered reference',
  service: 'fcp-sfd-frontend',
  uosr: '105000000_1733826312'
}

const mockReadyResponse = {
  uploadStatus: 'ready',
  metadata: validMetadata,
  form: {
    'file-field': completeFile,
    'text-field': 'some text value'
  },
  numberOfRejectedFiles: 0
}

const mockReadyResponseWithGroupedForm = {
  uploadStatus: 'ready',
  metadata: validMetadata,
  form: {
    document: [
      completeFile,
      {
        ...completeFile,
        fileId: 'f8b1fcab-9cb7-4e98-abd4-4ea03e27df95',
        filename: 'document-2.pdf'
      }
    ]
  },
  numberOfRejectedFiles: 0
}

const mockPendingResponse = {
  uploadStatus: 'pending',
  metadata: {},
  form: { 'file-field': pendingFile }
}

const mockInitiatedResponse = {
  uploadStatus: 'initiated',
  metadata: {},
  form: {}
}

const buildSession = (uploadId, journeyId, overrides = {}) => ({
  uploadId,
  journeyId,
  metadata: {
    sbi: validMetadata.sbi,
    submissionId: validMetadata.submissionId,
    ...overrides
  },
  timestamp: new Date()
})

const buildCallbackPayload = (journeyId, fileId, overrides = {}) => ({
  uploadStatus: 'ready',
  metadata: {
    ...validMetadata,
    journeyId,
    submissionId: `${Date.now()}`
  },
  form: {
    'file-field': {
      ...completeFile,
      fileId
    }
  },
  numberOfRejectedFiles: 0,
  ...overrides
})

const mockReadyStatus = (metadata = validMetadata) => ({
  ok: true,
  status: 200,
  json: async () => ({
    uploadStatus: 'ready',
    metadata,
    form: { 'file-field': completeFile },
    numberOfRejectedFiles: 0
  })
})

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  originalSessionsCollection = config.get('mongo.collections.sessions')
  originalStatusCollection = config.get('mongo.collections.status')
  originalMetadataCollection = config.get('mongo.collections.uploadMetadata')
  originalOutboxCollection = config.get('mongo.collections.outbox')

  config.set('mongo.collections.sessions', 'status-uploader-test-sessions')
  config.set('mongo.collections.status', 'status-uploader-test-status')
  config.set('mongo.collections.uploadMetadata', 'status-uploader-test-metadata')
  config.set('mongo.collections.outbox', 'status-uploader-test-outbox')

  sessionsCollection = config.get('mongo.collections.sessions')
  statusCollection = config.get('mongo.collections.status')
  metadataCollection = config.get('mongo.collections.uploadMetadata')
  outboxCollection = config.get('mongo.collections.outbox')

  await db.collection(sessionsCollection).deleteMany({})
  await db.collection(statusCollection).deleteMany({})
  await db.collection(metadataCollection).deleteMany({})
  await db.collection(outboxCollection).deleteMany({})

  server = await createServer()
  await server.initialize()
  vi.restoreAllMocks()
})

afterAll(async () => {
  await db.collection(sessionsCollection).deleteMany({})
  await db.collection(statusCollection).deleteMany({})
  await db.collection(metadataCollection).deleteMany({})
  await db.collection(outboxCollection).deleteMany({})

  config.set('mongo.collections.sessions', originalSessionsCollection)
  config.set('mongo.collections.status', originalStatusCollection)
  config.set('mongo.collections.uploadMetadata', originalMetadataCollection)
  config.set('mongo.collections.outbox', originalOutboxCollection)

  vi.restoreAllMocks()
  await server.stop()
})

afterEach(async () => {
  mockHttpClient.mockReset()
  await db.collection(sessionsCollection).deleteMany({})
  await db.collection(statusCollection).deleteMany({})
  await db.collection(metadataCollection).deleteMany({})
  await db.collection(outboxCollection).deleteMany({})
})

// ─── Successful responses ────────────────────────────────────────────────────

describe('GET /api/v1/uploader/status/{uploadId} — successful responses', () => {
  test('returns pending when scan is ready but no local acceptance record exists yet', async () => {
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReadyResponse
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data).toBeDefined()
    expect(response.result.data.uploadStatus).toBe('pending')
    expect(response.result.data.stage).toBe('awaiting-callback')
    expect(response.result.data.numberOfRejectedFiles).toBeUndefined()
    expect(response.result.data.form['file-field'].fileId).toBe(completeFile.fileId)
  })

  test('ready upload without numberOfRejectedFiles still awaits callback when local record is missing', async () => {
    const readyResponseWithoutRejectedCount = {
      uploadStatus: 'ready',
      metadata: { sbi: 105000000, crn: 1050000000 },
      form: { 'file-field': completeFile }
      // numberOfRejectedFiles intentionally omitted
    }

    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => readyResponseWithoutRejectedCount
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data).toBeDefined()
    expect(response.result.data.uploadStatus).toBe('pending')
    expect(response.result.data.stage).toBe('awaiting-callback')
    expect(response.result.data.numberOfRejectedFiles).toBeUndefined()
  })

  test('returns 200 with full file details for a ready upload', async () => {
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReadyResponse
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    const file = response.result.data.form['file-field']
    expect(file.fileId).toBe(completeFile.fileId)
    expect(file.filename).toBe(completeFile.filename)
    expect(file.contentType).toBe(completeFile.contentType)
    expect(file.fileStatus).toBe('complete')
    expect(file.s3Key).toBe(completeFile.s3Key)
    expect(file.s3Bucket).toBe(completeFile.s3Bucket)
    expect(file.checksumSha256).toBe(completeFile.checksumSha256)
    expect(file.contentLength).toBe(completeFile.contentLength)
  })

  test('returns indexed form keys for grouped file fields', async () => {
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReadyResponseWithGroupedForm
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.form.document).toBeUndefined()
    expect(response.result.data.form['document-1'].fileId).toBe(completeFile.fileId)
    expect(response.result.data.form['document-2'].fileId).toBe('f8b1fcab-9cb7-4e98-abd4-4ea03e27df95')
  })

  test('returns 200 for a pending upload', async () => {
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPendingResponse
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('pending')
  })

  test('returns 200 for an initiated upload with empty form', async () => {
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockInitiatedResponse
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('pending')
  })

  test('returns 200 with failure status and no numberOfRejectedFiles when files are rejected', async () => {
    const responseWithRejection = {
      ...mockReadyResponse,
      form: { 'file-field': rejectedFile },
      numberOfRejectedFiles: 1
    }
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => responseWithRejection
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('failure')
    expect(response.result.data.numberOfRejectedFiles).toBeUndefined()
    const file = response.result.data.form['file-field']
    expect(file.fileStatus).toBe('rejected')
    expect(file.hasError).toBe(true)
    expect(file.errorMessage).toBeDefined()
    expect(file.detectedContentType).toBeUndefined()
  })

  test('returns 200 with failure status and errorMessage when file is rejected for wrong MIME type', async () => {
    const wrongTypeRejectedFile = {
      fileId: 'c2d3e4f5-a6b7-4789-abcd-ef0123456789',
      filename: 'test.zip',
      contentType: 'application/zip',
      fileStatus: 'rejected',
      hasError: true,
      errorCode: 'WRONG_TYPE',
      errorMessage: 'The selected file type is not allowed'
    }
    const responseWithWrongType = {
      uploadStatus: 'ready',
      metadata: validMetadata,
      form: { 'file-field': wrongTypeRejectedFile },
      numberOfRejectedFiles: 1
    }
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => responseWithWrongType
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('failure')
    const file = response.result.data.form['file-field']
    expect(file.fileStatus).toBe('rejected')
    expect(file.contentType).toBe('application/zip')
    expect(file.errorMessage).toBe('The selected file type is not allowed')
    expect(file.errorCode).toBe('WRONG_TYPE')
  })

  test('returns 200 with pending status for pending response with full metadata and empty form', async () => {
    const pendingResponseWithFullMetadata = {
      uploadStatus: 'pending',
      metadata: validMetadata,
      form: {}
    }
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => pendingResponseWithFullMetadata
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('pending')
    expect(response.result.data.form).toEqual({})
  })

  test('forwards the correct URL to CDP Uploader', async () => {
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReadyResponse
    })

    await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(mockHttpClient).toHaveBeenCalledTimes(1)
    const [url] = mockHttpClient.mock.calls[0]
    expect(url).toContain(`/status/${validUploadId}`)
  })
})

// ─── Polling scenario ────────────────────────────────────────────────────────

describe('GET /api/v1/uploader/status/{uploadId} — polling scenario', () => {
  test('multiple sequential checks for the same uploadId each return 200 with mapped statuses', async () => {
    // Simulate a polling flow: initiated → pending → ready (0 rejections)
    // Expected mapped output without local callback state: pending → pending → pending
    mockHttpClient.mockReset()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockInitiatedResponse
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPendingResponse
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockReadyResponse
      })

    const responses = await Promise.all([
      server.inject({ method: 'GET', url: `/api/v1/uploader/status/${validUploadId}` }),
      server.inject({ method: 'GET', url: `/api/v1/uploader/status/${validUploadId}` }),
      server.inject({ method: 'GET', url: `/api/v1/uploader/status/${validUploadId}` })
    ])

    expect(responses[0].statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(responses[0].result.data.uploadStatus).toBe('pending')
    expect(responses[1].statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(responses[1].result.data.uploadStatus).toBe('pending')
    expect(responses[2].statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(responses[2].result.data.uploadStatus).toBe('pending')
    expect(responses[2].result.data.stage).toBe('awaiting-callback')
    expect(mockHttpClient).toHaveBeenCalledTimes(3)
  })
})

describe('GET /api/v1/uploader/status/{uploadId} — merged local verdicts', () => {
  test('returns success/accepted after callback is accepted by this service', async () => {
    const uploadId = randomUUID()
    const journeyId = randomUUID()
    const fileId = randomUUID()
    const callbackPayload = buildCallbackPayload(journeyId, fileId)

    await db.collection(sessionsCollection).insertOne(
      buildSession(uploadId, journeyId, { submissionId: callbackPayload.metadata.submissionId })
    )

    const callbackResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: callbackPayload
    })
    expect(callbackResponse.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

    mockHttpClient.mockResolvedValueOnce(mockReadyStatus(callbackPayload.metadata))

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${uploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('success')
    expect(response.result.data.stage).toBe('accepted')
    expect(response.result.data.errors).toBeNull()
  })

  test('failed-callback-then-status returns failure/rejected-by-processor with populated safe errors', async () => {
    const uploadId = randomUUID()
    const journeyId = randomUUID()
    const fileId = randomUUID()
    const callbackPayload = buildCallbackPayload(journeyId, fileId, {
      uploadStatus: 'pending'
    })
    delete callbackPayload.numberOfRejectedFiles

    await db.collection(sessionsCollection).insertOne(
      buildSession(uploadId, journeyId, { submissionId: callbackPayload.metadata.submissionId })
    )

    const callbackResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: callbackPayload
    })
    expect(callbackResponse.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

    mockHttpClient.mockResolvedValueOnce(mockReadyStatus(callbackPayload.metadata))

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${uploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('failure')
    expect(response.result.data.stage).toBe('rejected-by-processor')
    expect(response.result.data.errors).toBeInstanceOf(Array)
    expect(response.result.data.errors.length).toBeGreaterThan(0)
    expect(response.result.data.errors[0].errorType).toContain("uploadStatus must be 'ready'")
    expect(response.result.data.errors[0].receivedValue).toBeUndefined()
  })

  test('delivery-failure-then-status returns failure/delivery-failed', async () => {
    const uploadId = randomUUID()
    const journeyId = randomUUID()
    const fileId = randomUUID()
    const callbackPayload = buildCallbackPayload(journeyId, fileId)

    await db.collection(sessionsCollection).insertOne(
      buildSession(uploadId, journeyId, { submissionId: callbackPayload.metadata.submissionId })
    )

    const callbackResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: callbackPayload
    })
    expect(callbackResponse.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

    await db.collection(outboxCollection).updateMany(
      { 'payload.file.fileId': fileId },
      { $set: { status: PERMANENT_FAILURE, attempts: 5, lastAttemptedAt: new Date() } }
    )

    mockHttpClient.mockResolvedValueOnce(mockReadyStatus(callbackPayload.metadata))

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${uploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('failure')
    expect(response.result.data.stage).toBe('delivery-failed')
  })

  test('mixed outcome (one published and one permanent failure) returns failure/delivery-failed', async () => {
    const uploadId = randomUUID()
    const journeyId = randomUUID()
    const fileIdPublished = randomUUID()
    const fileIdFailed = randomUUID()
    const callbackPayload = buildCallbackPayload(journeyId, fileIdPublished)

    await db.collection(sessionsCollection).insertOne(
      buildSession(uploadId, journeyId, { submissionId: callbackPayload.metadata.submissionId })
    )

    const callbackResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/callback',
      payload: callbackPayload
    })
    expect(callbackResponse.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

    await db.collection(metadataCollection).updateOne(
      { 'file.fileId': fileIdPublished },
      { $set: { 'messaging.publishedAt': new Date() } }
    )

    await db.collection(statusCollection).insertOne({
      correlationId: journeyId,
      sbi: validMetadata.sbi,
      fileId: fileIdFailed,
      timestamp: new Date(),
      validated: true,
      errors: null
    })

    await db.collection(metadataCollection).insertOne({
      raw: {
        uploadStatus: 'ready',
        numberOfRejectedFiles: 0,
        ...completeFile,
        fileId: fileIdFailed
      },
      metadata: callbackPayload.metadata,
      file: {
        fileId: fileIdFailed,
        filename: completeFile.filename,
        contentType: completeFile.contentType,
        fileStatus: completeFile.fileStatus
      },
      s3: {
        key: completeFile.s3Key,
        bucket: completeFile.s3Bucket
      },
      messaging: {
        publishedAt: null,
        correlationId: journeyId,
        filesInBatch: 2
      }
    })

    await db.collection(outboxCollection).insertOne({
      messageId: randomUUID(),
      payload: {
        metadata: callbackPayload.metadata,
        file: {
          fileId: fileIdFailed,
          filename: completeFile.filename,
          contentType: completeFile.contentType,
          fileStatus: completeFile.fileStatus
        },
        messaging: {
          correlationId: journeyId,
          filesInBatch: 2
        }
      },
      status: PERMANENT_FAILURE,
      attempts: 5,
      createdAt: new Date(),
      lastAttemptedAt: new Date()
    })

    mockHttpClient.mockResolvedValueOnce(mockReadyStatus(callbackPayload.metadata))

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${uploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('failure')
    expect(response.result.data.stage).toBe('delivery-failed')
    expect(response.result.data.errors).toEqual([{ field: 'delivery', errorType: 'permanent-failure' }])
  })

  test('unresolved correlation reads pending/awaiting-callback when no session maps the upload id', async () => {
    const uploadId = randomUUID()

    await db.collection(statusCollection).insertOne({
      correlationId: randomUUID(),
      sbi: validMetadata.sbi,
      fileId: randomUUID(),
      timestamp: new Date(),
      validated: false,
      errors: [{ field: 'payload', errorType: 'uploadStatus must be ready' }]
    })

    mockHttpClient.mockResolvedValueOnce(mockReadyStatus(validMetadata))

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${uploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('pending')
    expect(response.result.data.stage).toBe('awaiting-callback')
  })
})

// ─── Input validation ────────────────────────────────────────────────────────

describe('GET /api/v1/uploader/status/{uploadId} — input validation', () => {
  test('returns 400 for a non-UUID uploadId', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/uploader/status/not-a-uuid'
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
    expect(response.result.message).toContain('uploadId')
  })

  test('returns 400 for an empty uploadId', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/uploader/status/'
    })

    // Hapi treats trailing slash as the route itself (405 or 404 depending on strip)
    expect([
      httpConstants.HTTP_STATUS_BAD_REQUEST,
      httpConstants.HTTP_STATUS_NOT_FOUND,
      httpConstants.HTTP_STATUS_METHOD_NOT_ALLOWED
    ]).toContain(response.statusCode)
  })

  test('returns 400 for a UUID v3 (not v4)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/uploader/status/6ba7b810-9dad-31d1-80b4-00c04fd430c8'
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
    expect(response.result.message).toContain('uploadId')
  })
})

// ─── CDP Uploader error handling ─────────────────────────────────────────────

describe('GET /api/v1/uploader/status/{uploadId} — CDP Uploader errors', () => {
  test('returns 404 when CDP Uploader returns 404', async () => {
    mockHttpClient.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found'
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_NOT_FOUND)
  })

  test('returns 502 when CDP Uploader returns 500', async () => {
    mockHttpClient.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
  })

  test('returns 502 when CDP Uploader response fails schema validation', async () => {
    const invalidResponse = {
      uploadStatus: 'ready'
      // missing metadata, form, numberOfRejectedFiles
    }
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => invalidResponse
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
  })

  test('returns 502 when CDP Uploader response is not valid JSON', async () => {
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token') }
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
  })

  test('returns 504 when CDP Uploader request times out', async () => {
    mockHttpClient.mockRejectedValue(new TimeoutError('The operation was aborted due to timeout'))

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT)
  })

  test('returns 502 when CDP Uploader connection is refused', async () => {
    mockHttpClient.mockRejectedValue(new Error('ECONNREFUSED'))

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
  })

  test('returns 502 when CDP Uploader returns invalid uploadStatus value', async () => {
    mockHttpClient.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...mockReadyResponse,
        uploadStatus: 'invalid-state'
      })
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
  })
})

// ─── No regression on existing routes ────────────────────────────────────────

describe('No regression on existing routes', () => {
  test('POST /api/v1/uploader/initiate still returns 400 for missing redirect', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/uploader/initiate',
      payload: {}
    })
    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
  })

  test('GET /health still returns 200', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health'
    })
    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
  })
})
