import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildCdpUploaderPayload, rewriteResponseUrls } from '../../../../../../src/api/v1/uploader/initiate/index.js'

// Use vi.hoisted so mockConfigGet is available when vi.mock factory is hoisted.
// The default implementation covers module-level config.get calls (e.g. baseUrl).
const { mockConfigGet } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    if (key === 'baseUrl.v1') return '/api/v1'
    return null
  })
}))

vi.mock('../../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

vi.mock('../../../../../../src/logging/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  })
}))

describe('Uploader Initiate Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildCdpUploaderPayload', () => {
    beforeEach(() => {
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'cdpUploaderS3Bucket': return 'test-bucket'
          case 'cdpUploaderS3Path': return 'uploads/'
          case 'cdpUploaderCallbackUrl': return 'http://localhost:3000/api/v1/callback'
          case 'cdpUploaderMimeTypes': return ['application/pdf', 'image/jpeg']
          case 'cdpUploaderMaxFileSize': return 10485760 // 10MB
          default: return null
        }
      })
    })

    it('should build correct CDP uploader payload', () => {
      const clientPayload = {
        redirect: '/upload-complete',
        metadata: {
          sbi: 123456789,
          crn: 1234567890,
          type: 'CS_Agreement_Evidence',
          reference: 'Test Reference'
        }
      }

      const result = buildCdpUploaderPayload(clientPayload)

      expect(result).toEqual({
        redirect: '/upload-complete',
        s3Bucket: 'test-bucket',
        s3Path: 'uploads/',
        callback: 'http://localhost:3000/api/v1/callback',
        mimeTypes: ['application/pdf', 'image/jpeg'],
        maxFileSize: 10485760,
        metadata: {
          sbi: 123456789,
          crn: 1234567890,
          type: 'CS_Agreement_Evidence',
          reference: 'Test Reference'
        }
      })

      // Verify config calls
      expect(mockConfigGet).toHaveBeenCalledWith('cdpUploaderS3Bucket')
      expect(mockConfigGet).toHaveBeenCalledWith('cdpUploaderS3Path')
      expect(mockConfigGet).toHaveBeenCalledWith('cdpUploaderCallbackUrl')
      expect(mockConfigGet).toHaveBeenCalledWith('cdpUploaderMimeTypes')
      expect(mockConfigGet).toHaveBeenCalledWith('cdpUploaderMaxFileSize')
    })

    it('should preserve all metadata fields from client payload', () => {
      const clientPayload = {
        redirect: '/complete',
        metadata: {
          sbi: 987654321,
          crn: 9876543210,
          frn: 1234567890,
          submissionId: 'sub-123',
          type: 'CS_Agreement_Evidence',
          reference: 'Complex Reference',
          service: 'rps-portal',
          uosr: 'uosr-value'
        }
      }

      const result = buildCdpUploaderPayload(clientPayload)

      expect(result.metadata).toEqual(clientPayload.metadata)
    })

    it('should handle different redirect paths', () => {
      const testCases = [
        '/upload-complete',
        '/success',
        '/dashboard',
        '/custom/path'
      ]

      testCases.forEach(redirect => {
        const clientPayload = {
          redirect,
          metadata: { test: 'value' }
        }

        const result = buildCdpUploaderPayload(clientPayload)
        expect(result.redirect).toBe(redirect)
      })
    })

    it('should handle empty metadata gracefully', () => {
      const clientPayload = {
        redirect: '/test',
        metadata: {}
      }

      const result = buildCdpUploaderPayload(clientPayload)
      expect(result.metadata).toEqual({})
    })
  })

  describe('rewriteResponseUrls', () => {
    beforeEach(() => {
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'uploaderUrl': return 'http://cdp-uploader:7337'
          case 'baseUrl.v1': return '/api/v1'
          default: return null
        }
      })
    })

    it('should rewrite URLs correctly', () => {
      const cdpResponse = {
        uploadId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        originalUploadUrl: 'http://cdp-uploader:7337/upload/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        originalStatusUrl: 'http://cdp-uploader:7337/status/9fcaabe5-77ec-44db-8356-3a6e8dc51b13'
      }

      const result = rewriteResponseUrls(cdpResponse)

      expect(result).toEqual({
        uploadId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        uploadUrl: 'http://cdp-uploader:7337/upload-and-scan/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        statusUrl: '/api/v1/uploader/status/9fcaabe5-77ec-44db-8356-3a6e8dc51b13'
      })

      expect(mockConfigGet).toHaveBeenCalledWith('uploaderUrl')
    })

    it('should handle different uploadIds', () => {
      const testUploadIds = [
        'test-123',
        'a0b1c2d3-e4f5-6789-abcd-ef0123456789',
        'short-id'
      ]

      testUploadIds.forEach(uploadId => {
        const cdpResponse = { uploadId }
        const result = rewriteResponseUrls(cdpResponse)

        expect(result.uploadId).toBe(uploadId)
        expect(result.uploadUrl).toContain(uploadId)
        expect(result.statusUrl).toContain(uploadId)
      })
    })

    it('should ignore extra fields in CDP response', () => {
      const cdpResponse = {
        uploadId: 'test-id',
        extraField: 'ignored',
        anotherField: 'also ignored'
      }

      const result = rewriteResponseUrls(cdpResponse)

      expect(result).toEqual({
        uploadId: 'test-id',
        uploadUrl: 'http://cdp-uploader:7337/upload-and-scan/test-id',
        statusUrl: '/api/v1/uploader/status/test-id'
      })

      expect(result).not.toHaveProperty('extraField')
      expect(result).not.toHaveProperty('anotherField')
    })
  })

  describe('Configuration Integration', () => {
    it('should handle missing config values gracefully in buildCdpUploaderPayload', () => {
      mockConfigGet.mockReturnValue(null)

      const clientPayload = {
        redirect: '/test',
        metadata: { test: 'value' }
      }

      const result = buildCdpUploaderPayload(clientPayload)

      expect(result).toEqual({
        redirect: '/test',
        s3Bucket: null,
        s3Path: null,
        callback: null,
        mimeTypes: null,
        maxFileSize: null,
        metadata: { test: 'value' }
      })
    })

    it('should handle missing config values gracefully in rewriteResponseUrls', () => {
      mockConfigGet.mockReturnValue(null)

      const cdpResponse = { uploadId: 'test-123' }
      const result = rewriteResponseUrls(cdpResponse)

      // baseUrl is captured at module-load time so it retains the value from
      // vi.hoisted initialisation; only runtime config.get calls return null
      expect(result).toEqual({
        uploadId: 'test-123',
        uploadUrl: 'null/upload-and-scan/test-123',
        statusUrl: '/api/v1/uploader/status/test-123'
      })
    })
  })
})
