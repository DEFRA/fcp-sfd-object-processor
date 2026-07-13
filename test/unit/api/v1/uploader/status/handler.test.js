import { describe, test, expect, vi, beforeEach } from 'vitest'
import { constants as httpConstants } from 'node:http2'

// Use vi.hoisted so mocks are available when vi.mock factory is hoisted.
const { mockConfigGet, mockHttpClient } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    switch (key) {
      case 'baseUrl.v1': return '/api/v1'
      case 'uploaderUrl': return 'http://cdp-uploader:7337'
      case 'uploaderStatusEndpoint': return '/status'
      case 'cdpUploaderMimeTypes': return ['application/pdf', 'image/jpeg', 'image/png']
      case 'cdpUploaderDocumentTypes': return ['CS_Agreement_Evidence', 'CS_Application_Evidence']
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
const { uploaderStatusRoute } = await import('../../../../../../src/api/v1/uploader/status/index.js')
const { TimeoutError } = await import('../../../../../../src/http/client.js')
const { metricsCounter } = await import('../../../../../../src/api/common/helpers/metrics.js')

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

const validReadyResponseWithRejections = {
  uploadStatus: 'ready',
  metadata: { sbi: 105000000, crn: 1050000000 },
  form: { 'file-field': completeFile },
  numberOfRejectedFiles: 2
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
  }
}

const validInitiatedResponse = {
  uploadStatus: 'initiated',
  metadata: {},
  form: {}
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
  mockHttpClient.mockReset()
})

// ─── Handler function tests ─────────────────────────────────────────────────

describe('uploaderStatusRoute handler', () => {
  const handler = uploaderStatusRoute.options.handler

  describe('successful proxying', () => {
    test('returns 200 with data envelope for ready status', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validReadyResponse
      })

      const { h, mockResponse, mockCode } = buildMockH()
      await handler(buildMockRequest(), h)

      expect(mockResponse).toHaveBeenCalledWith({
        data: expect.objectContaining({ uploadStatus: 'success' })
      })
      expect(mockCode).toHaveBeenCalledWith(httpConstants.HTTP_STATUS_OK)
    })

    test('ready status with zero rejections maps to success and omits numberOfRejectedFiles', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validReadyResponse
      })

      const { h, mockResponse } = buildMockH()
      await handler(buildMockRequest(), h)

      const [{ data }] = mockResponse.mock.calls[0]
      expect(data.uploadStatus).toBe('success')
      expect(data.numberOfRejectedFiles).toBeUndefined()
    })

    test('ready status with rejections maps to failure and omits numberOfRejectedFiles', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validReadyResponseWithRejections
      })

      const { h, mockResponse } = buildMockH()
      await handler(buildMockRequest(), h)

      const [{ data }] = mockResponse.mock.calls[0]
      expect(data.uploadStatus).toBe('failure')
      expect(data.numberOfRejectedFiles).toBeUndefined()
    })

    test('returns 200 with data envelope for pending status', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validPendingResponse
      })

      const { h, mockResponse, mockCode } = buildMockH()
      await handler(buildMockRequest(), h)

      expect(mockResponse).toHaveBeenCalledWith({
        data: expect.objectContaining({ uploadStatus: 'pending' })
      })
      expect(mockCode).toHaveBeenCalledWith(httpConstants.HTTP_STATUS_OK)
    })

    test('returns 200 with data envelope for initiated status', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validInitiatedResponse
      })

      const { h, mockResponse, mockCode } = buildMockH()
      await handler(buildMockRequest(), h)

      expect(mockResponse).toHaveBeenCalledWith({
        data: expect.objectContaining({ uploadStatus: 'pending' })
      })
      expect(mockCode).toHaveBeenCalledWith(httpConstants.HTTP_STATUS_OK)
    })

    test('fetches correct URL from config', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validReadyResponse
      })

      const { h } = buildMockH()
      await handler(buildMockRequest(validUploadId), h)

      expect(mockHttpClient).toHaveBeenCalledTimes(1)
      const [url] = mockHttpClient.mock.calls[0]
      expect(url).toBe(`http://cdp-uploader:7337/status/${validUploadId}`)
    })

    test('logs audit entry on request and response', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validReadyResponse
      })

      const { h } = buildMockH()
      await handler(buildMockRequest(), h)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            type: 'status_check',
            reference: validUploadId
          })
        }),
        expect.any(String)
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            type: 'status_check',
            outcome: 'success',
            reference: validUploadId,
            reason: 'ready'
          })
        }),
        expect.any(String)
      )
    })
  })

  describe('error handling', () => {
    test('throws 504 on TimeoutError', async () => {
      mockHttpClient.mockRejectedValue(new TimeoutError('The operation was aborted due to timeout'))

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT }
      })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ uploadId: validUploadId, retry: null }),
        expect.stringContaining('timed out')
      )
    })

    test('includes retry metadata in timeout logs when present', async () => {
      const timeoutError = new TimeoutError('timed out')
      timeoutError.retryMetadata = { attempts: 3, category: 'retryable' }
      mockHttpClient.mockRejectedValue(timeoutError)

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT }
      })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId: validUploadId,
          retry: { attempts: 3, category: 'retryable' }
        }),
        expect.stringContaining('timed out')
      )
    })

    test('throws 502 on network error', async () => {
      mockHttpClient.mockRejectedValue(new Error('ECONNREFUSED'))

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ uploadId: validUploadId, retry: null }),
        expect.stringContaining('failed')
      )
    })

    test('includes retry metadata in network error logs when present', async () => {
      const networkError = new Error('ECONNREFUSED')
      networkError.retryMetadata = { attempts: 3, category: 'retryable' }
      mockHttpClient.mockRejectedValue(networkError)

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId: validUploadId,
          retry: { attempts: 3, category: 'retryable' }
        }),
        expect.stringContaining('failed')
      )
    })

    test('throws 404 when CDP Uploader returns 404', async () => {
      mockHttpClient.mockResolvedValue({
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

    test('throws 502 when upstream error body cannot be read', async () => {
      mockHttpClient.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => { throw new Error('stream closed') }
      })

      const { h } = buildMockH()
      await expect(handler(buildMockRequest(), h)).rejects.toMatchObject({
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Unable to read response body', uploadId: validUploadId }),
        expect.any(String)
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
        expect.objectContaining({ statusCode: 500, uploadId: validUploadId }),
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
      mockHttpClient.mockResolvedValue({
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
      mockHttpClient.mockResolvedValue({
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

describe('uploaderStatusRoute validate.failAction', () => {
  const mockErr = new Error('"uploadId" is required')

  test('logs validation failure', async () => {
    await expect(
      uploaderStatusRoute.options.validate.failAction(null, null, mockErr)
    ).rejects.toThrow(mockErr)

    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: { message: mockErr.message } },
      '/uploader/status validation failed'
    )
  })

  test('increments validation failure metric', async () => {
    await expect(
      uploaderStatusRoute.options.validate.failAction(null, null, mockErr)
    ).rejects.toThrow(mockErr)

    expect(metricsCounter).toHaveBeenCalledWith('status_validation_failures')
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
