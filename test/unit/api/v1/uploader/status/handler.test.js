import { describe, test, expect, vi, beforeEach } from 'vitest'
import { constants as httpConstants } from 'node:http2'

// Use vi.hoisted so mockConfigGet is available when vi.mock factory is hoisted.
// The default covers module-level config.get calls (e.g. baseUrl).
const { mockConfigGet } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    if (key === 'baseUrl.v1') return '/api/v1'
    return null
  })
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

// Import after mocks are established
const { uploaderStatusRoute } = await import('../../../../../../src/api/v1/uploader/status/index.js')

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

const validReadyResponse = {
  uploadStatus: 'ready',
  metadata: { sbi: 105000000, crn: 1050000000 },
  form: { 'file-field': completeFile },
  numberOfRejectedFiles: 0
}

const validPendingResponse = {
  uploadStatus: 'pending',
  metadata: { sbi: 105000000, crn: 1050000000 },
  form: {
    'file-field': {
      fileId: 'a0b1c2d3-e4f5-4789-abcd-ef0123456789',
      filename: 'document.pdf',
      contentType: 'application/pdf',
      detectedContentType: 'application/pdf',
      fileStatus: 'pending'
    }
  },
  numberOfRejectedFiles: 0
}

const validInitiatedResponse = {
  uploadStatus: 'initiated',
  metadata: {},
  form: {},
  numberOfRejectedFiles: 0
}

// ─── Helper: build a mock request object ───────────────────────────────────

const buildMockRequest = (uploadId = validUploadId) => ({
  params: { uploadId },
  path: `/api/v1/uploader/status/${uploadId}`,
  method: 'get',
  auth: { artifacts: { decoded: { payload: { client_id: 'test-client' } } } },
  headers: {}
})

// ─── Helper: build a mock h toolkit object ─────────────────────────────────

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
      case 'uploaderStatusEndpoint': return '/status'
      case 'cdpUploaderTimeoutMs': return 30000
      default: return null
    }
  })
  global.fetch = vi.fn()
})

// ─── Handler function tests ─────────────────────────────────────────────────

describe('uploaderStatusRoute handler', () => {
  const handler = uploaderStatusRoute.options.handler

  describe('successful proxying', () => {
    test('returns 200 with data envelope for ready status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validReadyResponse
      })

      const { h, mockResponse, mockCode } = buildMockH()
      await handler(buildMockRequest(), h)

      expect(mockResponse).toHaveBeenCalledWith({ data: validReadyResponse })
      expect(mockCode).toHaveBeenCalledWith(httpConstants.HTTP_STATUS_OK)
    })

    test('returns 200 with data envelope for pending status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validPendingResponse
      })

      const { h, mockResponse, mockCode } = buildMockH()
      await handler(buildMockRequest(), h)

      expect(mockResponse).toHaveBeenCalledWith({ data: validPendingResponse })
      expect(mockCode).toHaveBeenCalledWith(httpConstants.HTTP_STATUS_OK)
    })

    test('returns 200 with data envelope for initiated status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validInitiatedResponse
      })

      const { h, mockResponse, mockCode } = buildMockH()
      await handler(buildMockRequest(), h)

      expect(mockResponse).toHaveBeenCalledWith({ data: validInitiatedResponse })
      expect(mockCode).toHaveBeenCalledWith(httpConstants.HTTP_STATUS_OK)
    })

    test('fetches correct URL from config', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validReadyResponse
      })

      const { h } = buildMockH()
      await handler(buildMockRequest(validUploadId), h)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url] = global.fetch.mock.calls[0]
      expect(url).toBe(`http://cdp-uploader:7337/status/${validUploadId}`)
    })

    test('logs audit entry on request and response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validReadyResponse
      })

      const { h } = buildMockH()
      await handler(buildMockRequest(), h)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'status_check',
          uploadId: validUploadId
        }),
        expect.any(String)
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'status_check_response',
          uploadId: validUploadId,
          uploadStatus: 'ready',
          statusCode: httpConstants.HTTP_STATUS_OK
        }),
        expect.any(String)
      )
    })
  })

  describe('error handling', () => {
    test('throws 504 on TimeoutError', async () => {
      const timeoutError = new Error('The operation was aborted due to timeout')
      timeoutError.name = 'TimeoutError'
      global.fetch = vi.fn().mockRejectedValue(timeoutError)

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT }
      })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ uploadId: validUploadId }),
        expect.stringContaining('timed out')
      )
    })

    test('throws 502 on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ uploadId: validUploadId }),
        expect.stringContaining('failed')
      )
    })

    test('throws 404 when CDP Uploader returns 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found'
      })

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_NOT_FOUND }
      })
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ uploadId: validUploadId }),
        expect.stringContaining('not found')
      )
    })

    test('throws 502 when CDP Uploader returns 500', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, uploadId: validUploadId }),
        expect.any(String)
      )
    })

    test('throws 502 when CDP Uploader returns 503', async () => {
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token') }
      })

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ uploadId: validUploadId }),
        expect.stringContaining('parse')
      )
    })

    test('throws 502 when CDP response fails schema validation', async () => {
      const invalidResponse = {
        uploadStatus: 'ready',
        // missing metadata, form, numberOfRejectedFiles
      }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidResponse
      })

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ uploadId: validUploadId }),
        expect.stringContaining('validation')
      )
    })

    test('throws 502 when CDP response has invalid uploadStatus', async () => {
      const invalidResponse = {
        ...validReadyResponse,
        uploadStatus: 'processing' // not a valid enum value
      }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidResponse
      })

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
    })
  })
})

// ─── Route configuration tests ──────────────────────────────────────────────

describe('uploaderStatusRoute configuration', () => {
  test('uses GET method', () => {
    expect(uploaderStatusRoute.method).toBe('GET')
  })

  test('path is /api/v1/uploader/status/{uploadId}', () => {
    expect(uploaderStatusRoute.path).toBe('/api/v1/uploader/status/{uploadId}')
  })

  test('has uploader tag for swagger', () => {
    expect(uploaderStatusRoute.options.tags).toContain('uploader')
    expect(uploaderStatusRoute.options.tags).toContain('api')
  })

  test('validates params with uploaderStatusParamsSchema', () => {
    expect(uploaderStatusRoute.options.validate.params).toBeDefined()
  })

  test('has response schema defined', () => {
    expect(uploaderStatusRoute.options.response.status).toBeDefined()
  })

  test('does not disable authentication (auth is not false)', () => {
    expect(uploaderStatusRoute.options.auth).not.toBe(false)
  })
})
