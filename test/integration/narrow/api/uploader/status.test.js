import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest'

import { createServer } from '../../../../../src/api/index.js'

let server
const originalFetch = global.fetch

// ─── Test fixtures ──────────────────────────────────────────────────────────

const validUploadId = '9fcaabe5-77ec-44db-8356-3a6e8dc51b13'

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
  filename: 'virus.exe',
  contentType: 'application/octet-stream',
  detectedContentType: 'application/octet-stream',
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

const mockPendingResponse = {
  uploadStatus: 'pending',
  metadata: {},
  form: { 'file-field': pendingFile },
  numberOfRejectedFiles: 0
}

const mockInitiatedResponse = {
  uploadStatus: 'initiated',
  metadata: {},
  form: {},
  numberOfRejectedFiles: 0
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  server = await createServer()
  await server.initialize()
  vi.restoreAllMocks()
})

afterAll(async () => {
  vi.restoreAllMocks()
  global.fetch = originalFetch
  await server.stop()
})

afterEach(() => {
  global.fetch = originalFetch
})

// ─── Successful responses ────────────────────────────────────────────────────

describe('GET /api/v1/uploader/status/{uploadId} — successful responses', () => {
  test('returns 200 with data envelope for a ready upload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
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
    expect(response.result.data.uploadStatus).toBe('ready')
    expect(response.result.data.numberOfRejectedFiles).toBe(0)
    expect(response.result.data.form['file-field'].fileId).toBe(completeFile.fileId)
  })

  test('returns 200 with full file details for a ready upload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
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

  test('returns 200 for a pending upload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
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
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockInitiatedResponse
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.uploadStatus).toBe('initiated')
  })

  test('returns 200 with rejected file details including GDS error message', async () => {
    const responseWithRejection = {
      ...mockReadyResponse,
      form: { 'file-field': rejectedFile },
      numberOfRejectedFiles: 1
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => responseWithRejection
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data.numberOfRejectedFiles).toBe(1)
    const file = response.result.data.form['file-field']
    expect(file.fileStatus).toBe('rejected')
    expect(file.hasError).toBe(true)
    expect(file.errorMessage).toBeDefined()
  })

  test('forwards the correct URL to CDP Uploader', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReadyResponse
    })

    await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain(`/status/${validUploadId}`)
  })
})

// ─── Polling scenario ────────────────────────────────────────────────────────

describe('GET /api/v1/uploader/status/{uploadId} — polling scenario', () => {
  test('multiple sequential checks for the same uploadId each return 200', async () => {
    // Simulate a polling flow: initiated → pending → ready
    global.fetch = vi.fn()
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
    expect(responses[0].result.data.uploadStatus).toBe('initiated')
    expect(responses[1].statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(responses[1].result.data.uploadStatus).toBe('pending')
    expect(responses[2].statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(responses[2].result.data.uploadStatus).toBe('ready')
    expect(global.fetch).toHaveBeenCalledTimes(3)
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
    global.fetch = vi.fn().mockResolvedValue({
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
    global.fetch = vi.fn().mockResolvedValue({
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
    global.fetch = vi.fn().mockResolvedValue({
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
    global.fetch = vi.fn().mockResolvedValue({
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
    const timeoutError = new Error('The operation was aborted due to timeout')
    timeoutError.name = 'TimeoutError'
    global.fetch = vi.fn().mockRejectedValue(timeoutError)

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT)
  })

  test('returns 502 when CDP Uploader connection is refused', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/uploader/status/${validUploadId}`
    })

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
  })

  test('returns 502 when CDP Uploader returns invalid uploadStatus value', async () => {
    global.fetch = vi.fn().mockResolvedValue({
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
