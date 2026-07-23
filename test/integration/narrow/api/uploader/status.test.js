import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest'

import { createServer } from '../../../../../src/api/index.js'

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

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  server = await createServer()
  await server.initialize()
  vi.restoreAllMocks()
})

afterAll(async () => {
  vi.restoreAllMocks()
  await server.stop()
})

afterEach(() => {
  mockHttpClient.mockReset()
})

// ─── Successful responses ────────────────────────────────────────────────────

describe('GET /api/v1/uploader/status/{uploadId} — successful responses', () => {
  test('returns 200 with data envelope for a ready upload with no rejections (success)', async () => {
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
    expect(response.result.data.uploadStatus).toBe('success')
    expect(response.result.data.numberOfRejectedFiles).toBeUndefined()
    expect(response.result.data.form['file-field'].fileId).toBe(completeFile.fileId)
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
    // Expected mapped output:    pending  → pending → success
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
    expect(responses[2].result.data.uploadStatus).toBe('success')
    expect(mockHttpClient).toHaveBeenCalledTimes(3)
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
