import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest'

import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'

let server
const originalFetch = global.fetch

const mockValidPayload = {
  redirect: 'https://example.com/upload-complete',
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

beforeAll(async () => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  vi.restoreAllMocks()
  global.fetch = originalFetch
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('POST to the /api/v1/uploader/initiate route', async () => {
  server = await createServer()
  await server.initialize()

  describe('with a valid payload and successful CDP Uploader response', () => {
    test('should return 200 with rewritten URLs', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCdpUploaderResponse
      })

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload: mockValidPayload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      expect(response.result.data.uploadId).toBe('9fcaabe5-77ec-44db-8356-3a6e8dc51b13')
      expect(response.result.data.uploadUrl).toBe('/api/v1/uploader/upload-and-scan/9fcaabe5-77ec-44db-8356-3a6e8dc51b13')
      expect(response.result.data.statusUrl).toBe('/api/v1/uploader/status/9fcaabe5-77ec-44db-8356-3a6e8dc51b13')
    })

    test('should forward enriched payload to CDP Uploader', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCdpUploaderResponse
      })

      await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload: mockValidPayload
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url, options] = global.fetch.mock.calls[0]
      const body = JSON.parse(options.body)

      expect(url).toContain('/initiate')
      expect(body.redirect).toBe(mockValidPayload.redirect)
      expect(body.s3Bucket).toBe(config.get('cdpUploaderS3Bucket'))
      expect(body.s3Path).toBe(config.get('cdpUploaderS3Path'))
      expect(body.callbackUrl).toBe(config.get('cdpUploaderCallbackUrl'))
      expect(body.metadata).toEqual(mockValidPayload.metadata)
    })
  })

  describe('with an invalid payload', () => {
    test('should return 400 for missing redirect', async () => {
      const { redirect, ...payload } = mockValidPayload

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
      expect(response.result.message).toContain('redirect')
    })

    test('should return 400 for missing metadata', async () => {
      const { metadata, ...payload } = mockValidPayload

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
      expect(response.result.message).toContain('metadata')
    })

    test('should return 400 for invalid sbi format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload: {
          ...mockValidPayload,
          metadata: { ...mockValidPayload.metadata, sbi: 123 }
        }
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
      expect(response.result.message).toContain('sbi')
    })

    test('should return 400 for unknown fields (strict mode)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload: {
          ...mockValidPayload,
          unknownField: 'should-fail'
        }
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
      expect(response.result.message).toContain('unknownField')
    })

    test('should return 400 for empty payload', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload: {}
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
    })
  })

  describe('CDP Uploader error handling', () => {
    test('should return 504 on timeout', async () => {
      const timeoutError = new Error('The operation was aborted due to timeout')
      timeoutError.name = 'TimeoutError'
      global.fetch = vi.fn().mockRejectedValue(timeoutError)

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload: mockValidPayload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT)
    })

    test('should return 502 on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload: mockValidPayload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
    })

    test('should return 502 on non-2xx response from CDP Uploader', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload: mockValidPayload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
    })

    test('should return 502 on invalid JSON response from CDP Uploader', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected token') }
      })

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/uploader/initiate',
        payload: mockValidPayload
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
    })
  })
})
