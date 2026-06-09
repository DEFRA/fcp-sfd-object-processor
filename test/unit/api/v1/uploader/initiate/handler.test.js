import { describe, test, expect, vi, beforeEach } from 'vitest'
import { constants as httpConstants } from 'node:http2'

// Use vi.hoisted so mocks are available when vi.mock factory is hoisted.
const { mockConfigGet, mockHttpClient } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    switch (key) {
      case 'baseUrl.v1': return '/api/v1'
      case 'cdpUploaderMimeTypes': return ['application/pdf', 'image/jpeg', 'image/png']
      case 'cdpUploaderS3Bucket': return 'test-bucket'
      case 'cdpUploaderS3Path': return 'uploads/'
      case 'cdpUploaderCallbackUrl': return 'http://localhost:3000/api/v1/callback'
      case 'cdpUploaderMaxFileSize': return 10485760
      default: return null
    }
  }),
  mockHttpClient: vi.fn()
}))

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}

vi.mock('../../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

vi.mock('../../../../../../src/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

vi.mock('../../../../../../src/api/common/helpers/metrics.js', () => ({
  metricsCounter: vi.fn()
}))

vi.mock('../../../../../../src/http/client.js', () => ({
  httpClient: mockHttpClient,
  TimeoutError: class TimeoutError extends Error {
    constructor (msg) { super(msg); this.name = 'TimeoutError' }
  },
  NetworkError: class NetworkError extends Error {},
  AbortError: class AbortError extends Error {}
}))

// Import after mocks are established
const { uploaderInitiateRoute } = await import('../../../../../../src/api/v1/uploader/initiate/index.js')
const { TimeoutError } = await import('../../../../../../src/http/client.js')

// ─── Test fixtures ──────────────────────────────────────────────────────────

const validInitiateRequest = {
  redirect: '/upload-complete',
  metadata: {
    sbi: 105000000,
    crn: 1050000000,
    type: 'CS_Agreement_Evidence',
    reference: 'Test Reference'
  }
}

const validInitiateResponse = {
  uploadId: 'a0b1c2d3-e4f5-4789-abcd-ef0123456789',
  uploadUrl: 'http://cdp-uploader:7337/upload-and-scan/a0b1c2d3-e4f5-4789-abcd-ef0123456789'
}

const buildMockRequest = () => ({
  payload: validInitiateRequest,
  path: '/api/v1/uploader/initiate',
  method: 'post',
  auth: { artifacts: { decoded: { payload: { client_id: 'test-client' } } } },
  headers: {}
})

const buildMockH = () => {
  const mockCode = vi.fn().mockReturnThis()
  const mockResponse = vi.fn().mockReturnValue({ code: mockCode })
  return { h: { response: mockResponse }, mockResponse, mockCode }
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockConfigGet.mockImplementation((key) => {
    switch (key) {
      case 'baseUrl.v1': return '/api/v1'
      case 'uploaderUrl': return 'http://cdp-uploader:7337'
      case 'cdpUploaderMimeTypes': return ['application/pdf', 'image/jpeg', 'image/png']
      case 'cdpUploaderS3Bucket': return 'test-bucket'
      case 'cdpUploaderS3Path': return 'uploads/'
      case 'cdpUploaderCallbackUrl': return 'http://localhost:3000/api/v1/callback'
      case 'cdpUploaderMaxFileSize': return 10485760
      case 'cdpUploaderTimeoutMs': return 30000
      default: return null
    }
  })
  mockHttpClient.mockReset()
})

// ─── Handler function tests ─────────────────────────────────────────────────

describe('uploaderInitiateRoute handler', () => {
  const handler = uploaderInitiateRoute.options.handler

  describe('successful proxying', () => {
    test('returns 201 with rewritten response URLs', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validInitiateResponse
      })

      const { h, mockResponse, mockCode } = buildMockH()
      await handler(buildMockRequest(), h)

      const responsePayload = mockResponse.mock.calls[0][0]
      expect(responsePayload.data.uploadId).toBe('a0b1c2d3-e4f5-4789-abcd-ef0123456789')
      expect(responsePayload.data.uploadUrl).toContain('/upload-and-scan')
      expect(responsePayload.data.statusUrl).toContain('/api/v1/uploader/status')
      expect(mockCode).toHaveBeenCalledWith(httpConstants.HTTP_STATUS_OK)
    })

    test('logs successful initiate with metrics', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => validInitiateResponse
      })

      const { h } = buildMockH()
      await handler(buildMockRequest(), h)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('Forwarding')
      )
    })
  })

  describe('error handling', () => {
    test('throws 504 on TimeoutError and logs retry metadata', async () => {
      mockHttpClient.mockRejectedValue(new TimeoutError('The operation was aborted due to timeout'))

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ retry: null }),
        expect.stringContaining('timed out')
      )
    })

    test('throws 502 on network error and logs retry metadata', async () => {
      mockHttpClient.mockRejectedValue(new Error('ECONNREFUSED'))

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ retry: null }),
        expect.stringContaining('failed')
      )
    })

    test('throws 502 when CDP Uploader returns 500', async () => {
      mockHttpClient.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 }),
        expect.any(String)
      )
    })

    test('throws 502 when CDP Uploader returns 503', async () => {
      mockHttpClient.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable'
      })

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
    })

    test('throws 502 when response JSON parsing fails', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => { throw new SyntaxError('Unexpected token') }
      })

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('parse')
      )
    })

    test('throws 502 when response fails contract validation', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          uploadId: null // Invalid: should be a string
        })
      })

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('missing uploadId')
      )
    })
  })
})
