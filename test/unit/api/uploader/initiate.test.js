import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { constants as httpConstants } from 'node:http2'

import { initiatePayloadSchema } from '../../../../src/api/v1/uploader/initiate/schema.js'

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

vi.mock('../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => mockConfigValues[key])
  }
}))

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  })
}))

describe('initiatePayloadSchema validation', () => {
  describe('valid payloads', () => {
    test('valid complete payload passes validation', () => {
      const { error } = initiatePayloadSchema.validate(mockValidPayload)
      expect(error).toBeUndefined()
    })

    test('valid payload with rps-portal service passes validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, service: 'rps-portal' }
      })
      expect(error).toBeUndefined()
    })
  })

  describe('redirect validation', () => {
    test('missing redirect fails validation', () => {
      const { redirect, ...payload } = mockValidPayload
      const { error } = initiatePayloadSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['redirect'])
      expect(error.details[0].type).toBe('any.required')
    })

    test('valid relative redirect URL passes validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        redirect: '/some/path/to/success'
      })
      expect(error).toBeUndefined()
    })

    test('absolute redirect URL fails validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        redirect: 'https://example.com/upload-complete'
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['redirect'])
      expect(error.details[0].type).toBe('string.pattern.base')
    })

    test('redirect not starting with / fails validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        redirect: 'not-starting-with-slash'
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['redirect'])
      expect(error.details[0].type).toBe('string.pattern.base')
    })
  })

  describe('metadata validation', () => {
    test('missing metadata fails validation', () => {
      const { metadata, ...payload } = mockValidPayload
      const { error } = initiatePayloadSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata'])
    })

    test('missing sbi fails validation', () => {
      const { sbi, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'sbi'])
    })

    test('missing crn fails validation', () => {
      const { crn, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'crn'])
    })

    test('missing frn fails validation', () => {
      const { frn, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'frn'])
    })

    test('missing submissionId fails validation', () => {
      const { submissionId, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'submissionId'])
    })

    test('missing type fails validation', () => {
      const { type, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'type'])
    })

    test('any string value for type passes validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, type: 'SomeNewType' }
      })
      expect(error).toBeUndefined()
    })

    test('missing reference fails validation', () => {
      const { reference, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'reference'])
    })

    test('missing service fails validation', () => {
      const { service, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'service'])
    })

    test('missing uosr fails validation', () => {
      const { uosr, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'uosr'])
    })

    test('invalid sbi format fails validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, sbi: 123 }
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'sbi'])
    })

    test('invalid crn format fails validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, crn: 123 }
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'crn'])
    })

    test('invalid service value fails validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, service: 'invalid-service' }
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'service'])
      expect(error.details[0].type).toBe('any.only')
    })
  })

  describe('strict mode', () => {
    test('unknown top-level fields are rejected', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        unknownField: 'should-fail'
      })
      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('object.unknown')
    })

    test('unknown metadata fields are rejected', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, extraField: 'should-fail' }
      })
      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('object.unknown')
    })
  })
})

describe('uploader initiate handler', () => {
  let uploaderInitiateRoute
  let buildCdpUploaderPayload
  let rewriteResponseUrls
  const originalFetch = global.fetch

  beforeEach(async () => {
    vi.resetModules()

    vi.doMock('../../../../src/config/index.js', () => ({
      config: {
        get: vi.fn((key) => mockConfigValues[key])
      }
    }))

    vi.doMock('../../../../src/logging/logger.js', () => ({
      createLogger: () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
      })
    }))

    const mod = await import('../../../../src/api/v1/uploader/initiate/index.js')
    uploaderInitiateRoute = mod.uploaderInitiateRoute
    buildCdpUploaderPayload = mod.buildCdpUploaderPayload
    rewriteResponseUrls = mod.rewriteResponseUrls
  })

  afterEach(() => {
    global.fetch = originalFetch
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCdpUploaderResponse
      })

      await uploaderInitiateRoute.options.handler(mockRequest, mockH)

      expect(global.fetch).toHaveBeenCalledWith(
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCdpUploaderResponse
      })

      await uploaderInitiateRoute.options.handler(mockRequest, mockH)

      const fetchBody = JSON.parse(global.fetch.mock.calls[0][1].body)
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
      const timeoutError = new Error('The operation was aborted due to timeout')
      timeoutError.name = 'TimeoutError'
      global.fetch = vi.fn().mockRejectedValue(timeoutError)

      const result = await uploaderInitiateRoute.options.handler(mockRequest, mockH)

      expect(result.isBoom).toBe(true)
      expect(result.output.statusCode).toBe(httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT)
    })

    test('returns 502 on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await uploaderInitiateRoute.options.handler(mockRequest, mockH)

      expect(result.isBoom).toBe(true)
      expect(result.output.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
    })

    test('returns 502 on non-2xx response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      const result = await uploaderInitiateRoute.options.handler(mockRequest, mockH)

      expect(result.isBoom).toBe(true)
      expect(result.output.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
    })

    test('returns 502 on invalid JSON response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected token') }
      })

      const result = await uploaderInitiateRoute.options.handler(mockRequest, mockH)

      expect(result.isBoom).toBe(true)
      expect(result.output.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_GATEWAY)
    })
  })
})
