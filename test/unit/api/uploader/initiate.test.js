import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { constants as httpConstants } from 'node:http2'

const mockValidPayload = {
  redirect: '/upload-complete',
  metadata: {
    sbi: 105000000,
    crn: 1050000000,
    frn: 1102658375,
    submissionId: '1733826312',
    type: 'CS_Agreement_Evidence',
    reference: 'user entered reference',
    service: 'fcp-sfd-frontend',
    uosr: '105000000_1733826312'
  }
}

const mockCdpUploaderResponse = {
  uploadId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
  uploadUrl: 'http://cdp-uploader:7337/upload/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
  statusUrl: 'http://cdp-uploader:7337/status/9fcaabe5-77ec-44db-8356-3a6e8dc51b13'
}

const mockConfigValues = {
  'baseUrl.v1': '/api/v1',
  uploaderUrl: 'http://cdp-uploader:7337',
  uploaderInitiateEndpoint: '/initiate',
  cdpUploaderS3Bucket: 'test-bucket',
  cdpUploaderS3Path: 'uploads',
  cdpUploaderCallbackUrl: 'http://localhost:3004/api/v1/callback',
  cdpUploaderMimeTypes: ['application/pdf', 'image/jpeg'],
  cdpUploaderMaxFileSize: 10485760,
  cdpUploaderTimeoutMs: 30000
}

describe('uploader initiate handler', () => {
  let uploaderInitiateRoute
  let buildCdpUploaderPayload
  let rewriteResponseUrls
  let mockLogger
  let mockMetricsCounter
  let mockHttpClient
  let TimeoutError

  beforeEach(async () => {
    vi.resetModules()

    mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
    mockMetricsCounter = vi.fn().mockResolvedValue(undefined)
    mockHttpClient = vi.fn()

    vi.doMock('../../../../src/config/index.js', () => ({
      config: {
        get: vi.fn((key) => mockConfigValues[key])
      }
    }))

    vi.doMock('../../../../src/logging/logger.js', () => ({
      createLogger: () => mockLogger
    }))

    vi.doMock('../../../../src/api/common/helpers/metrics.js', () => ({
      metricsCounter: mockMetricsCounter
    }))

    vi.doMock('../../../../src/http/client.js', () => ({
      httpClient: mockHttpClient,
      TimeoutError: class TimeoutError extends Error {
        constructor (msg) { super(msg); this.name = 'TimeoutError' }
      }
    }))

    const mod = await import('../../../../src/api/v1/uploader/initiate/index.js')
    uploaderInitiateRoute = mod.uploaderInitiateRoute
    buildCdpUploaderPayload = mod.buildCdpUploaderPayload
    rewriteResponseUrls = mod.rewriteResponseUrls
    const clientMod = await import('../../../../src/http/client.js')
    TimeoutError = clientMod.TimeoutError
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('buildCdpUploaderPayload', () => {
    test('merges client payload with server config values', () => {
      const result = buildCdpUploaderPayload(mockValidPayload)

      expect(result).toEqual({
        redirect: mockValidPayload.redirect,
        s3Bucket: 'test-bucket',
        s3Path: 'uploads',
        callback: 'http://localhost:3004/api/v1/callback',
        mimeTypes: ['application/pdf', 'image/jpeg'],
        maxFileSize: 10485760,
        metadata: mockValidPayload.metadata
      })
    })

    test('passes through redirect from client payload', () => {
      const customPayload = { ...mockValidPayload, redirect: 'https://custom.example.com/done' }
      const result = buildCdpUploaderPayload(customPayload)
      expect(result.redirect).toBe('https://custom.example.com/done')
    })

    test('passes through metadata from client payload', () => {
      const result = buildCdpUploaderPayload(mockValidPayload)
      expect(result.metadata).toEqual(mockValidPayload.metadata)
    })
  })

  describe('rewriteResponseUrls', () => {
    test('rewrites uploadUrl to direct CDP URL and statusUrl to proxy path', () => {
      const result = rewriteResponseUrls(mockCdpUploaderResponse)

      expect(result).toEqual({
        uploadId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        uploadUrl: 'http://cdp-uploader:7337/upload-and-scan/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        statusUrl: '/api/v1/uploader/status/9fcaabe5-77ec-44db-8356-3a6e8dc51b13'
      })
    })
  })

  describe('handler', () => {
    const mockRequest = {
      payload: mockValidPayload
    }

    let mockCode
    let mockH

    beforeEach(() => {
      mockCode = vi.fn()
      mockH = {
        response: vi.fn().mockReturnValue({ code: mockCode })
      }
    })

    test('returns 200 with rewritten URLs on successful proxy', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        json: async () => mockCdpUploaderResponse
      })

      await uploaderInitiateRoute.options.handler(mockRequest, mockH)

      expect(mockHttpClient).toHaveBeenCalledWith(
        'http://cdp-uploader:7337/initiate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      )

      expect(mockH.response).toHaveBeenCalledWith({
        data: {
          uploadId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
          uploadUrl: 'http://cdp-uploader:7337/upload-and-scan/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
          statusUrl: '/api/v1/uploader/status/9fcaabe5-77ec-44db-8356-3a6e8dc51b13'
        }
      })

      expect(mockCode).toHaveBeenCalledWith(httpConstants.HTTP_STATUS_OK)
    })

    test('sends correct payload to CDP Uploader', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        json: async () => mockCdpUploaderResponse
      })

      await uploaderInitiateRoute.options.handler(mockRequest, mockH)

      const fetchBody = JSON.parse(mockHttpClient.mock.calls[0][1].body)
      expect(fetchBody).toEqual({
        redirect: mockValidPayload.redirect,
        s3Bucket: 'test-bucket',
        s3Path: 'uploads',
        callback: 'http://localhost:3004/api/v1/callback',
        mimeTypes: ['application/pdf', 'image/jpeg'],
        maxFileSize: 10485760,
        metadata: mockValidPayload.metadata
      })
    })

    test('returns 504 on timeout', async () => {
      mockHttpClient.mockRejectedValue(new TimeoutError('The operation was aborted due to timeout'))

      await expect(uploaderInitiateRoute.options.handler(mockRequest, mockH)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ retry: null }),
        expect.stringContaining('timed out')
      )
    })

    test('includes retry metadata in timeout logs when present', async () => {
      const timeoutError = new TimeoutError('timed out')
      timeoutError.retryMetadata = { attempts: 3, category: 'retryable' }
      mockHttpClient.mockRejectedValue(timeoutError)

      await expect(uploaderInitiateRoute.options.handler(mockRequest, mockH)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          retry: { attempts: 3, category: 'retryable' }
        }),
        expect.stringContaining('timed out')
      )
    })

    test('returns 502 on network error', async () => {
      mockHttpClient.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(uploaderInitiateRoute.options.handler(mockRequest, mockH)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ retry: null }),
        expect.stringContaining('failed')
      )
    })

    test('includes retry metadata in network error logs when present', async () => {
      const networkError = new Error('ECONNREFUSED')
      networkError.retryMetadata = { attempts: 3, category: 'retryable' }
      mockHttpClient.mockRejectedValue(networkError)

      await expect(uploaderInitiateRoute.options.handler(mockRequest, mockH)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          retry: { attempts: 3, category: 'retryable' }
        }),
        expect.stringContaining('failed')
      )
    })

    test('returns 502 on non-2xx response when body cannot be read', async () => {
      mockHttpClient.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => { throw new Error('stream closed') }
      })

      await expect(uploaderInitiateRoute.options.handler(mockRequest, mockH)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Unable to read response body' }),
        expect.any(String)
      )
    })

    test('returns 502 on non-2xx response', async () => {
      mockHttpClient.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      await expect(uploaderInitiateRoute.options.handler(mockRequest, mockH)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String)
      )
    })

    test('returns 502 on invalid JSON response', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected token') }
      })

      await expect(uploaderInitiateRoute.options.handler(mockRequest, mockH)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
    })

    test('returns 502 when CDP response is missing uploadId', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        json: async () => ({ uploadUrl: 'http://cdp-uploader:7337/upload/some-id' })
      })

      await expect(uploaderInitiateRoute.options.handler(mockRequest, mockH)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
    })

    test('returns 502 when CDP response has null uploadId', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        json: async () => ({ ...mockCdpUploaderResponse, uploadId: null })
      })

      await expect(uploaderInitiateRoute.options.handler(mockRequest, mockH)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
    })

    test('returns 502 when CDP response is an empty object', async () => {
      mockHttpClient.mockResolvedValue({
        ok: true,
        json: async () => ({})
      })

      await expect(uploaderInitiateRoute.options.handler(mockRequest, mockH)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY }
      })
    })
  })

  describe('validate.failAction', () => {
    const mockErr = new Error('"redirect" is required')

    test('logs the validation error', async () => {
      await expect(
        uploaderInitiateRoute.options.validate.failAction(null, null, mockErr)
      ).rejects.toThrow(mockErr)

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: { message: mockErr.message } },
        '/uploader/initiate validation failed'
      )
    })

    test('increments the metrics counter', async () => {
      await expect(
        uploaderInitiateRoute.options.validate.failAction(null, null, mockErr)
      ).rejects.toThrow(mockErr)

      expect(mockMetricsCounter).toHaveBeenCalledWith('initiate_validation_failures')
    })

    test('throws the validation error', async () => {
      await expect(
        uploaderInitiateRoute.options.validate.failAction(null, null, mockErr)
      ).rejects.toThrow(mockErr)
    })
  })
})
