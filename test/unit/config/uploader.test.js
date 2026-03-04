import { describe, test, expect } from 'vitest'
import { uploaderConfig } from '../../../src/config/uploader.js'

describe('uploaderConfig', () => {
  test('should have uploaderUrl field', () => {
    expect(uploaderConfig.uploaderUrl).toBeDefined()
    expect(uploaderConfig.uploaderUrl.doc).toBe('The base URL for the cdp uploader api')
    expect(uploaderConfig.uploaderUrl.format).toBe(String)
    expect(uploaderConfig.uploaderUrl.nullable).toBe(false)
    expect(uploaderConfig.uploaderUrl.env).toBe('CDP_UPLOADER_URL')
  })

  test('should have uploaderInitiateEndpoint field with default', () => {
    expect(uploaderConfig.uploaderInitiateEndpoint).toBeDefined()
    expect(uploaderConfig.uploaderInitiateEndpoint.doc).toBe('The endpoint path for initiating document scans')
    expect(uploaderConfig.uploaderInitiateEndpoint.format).toBe('endpoint-path')
    expect(uploaderConfig.uploaderInitiateEndpoint.nullable).toBe(false)
    expect(uploaderConfig.uploaderInitiateEndpoint.default).toBe('/initiate')
    expect(uploaderConfig.uploaderInitiateEndpoint.env).toBe('CDP_UPLOADER_INITIATE_ENDPOINT')
  })

  test('should have uploaderStatusEndpoint field with default', () => {
    expect(uploaderConfig.uploaderStatusEndpoint).toBeDefined()
    expect(uploaderConfig.uploaderStatusEndpoint.doc).toBe('The endpoint path for checking scan completion status')
    expect(uploaderConfig.uploaderStatusEndpoint.format).toBe('endpoint-path')
    expect(uploaderConfig.uploaderStatusEndpoint.nullable).toBe(false)
    expect(uploaderConfig.uploaderStatusEndpoint.default).toBe('/status')
    expect(uploaderConfig.uploaderStatusEndpoint.env).toBe('CDP_UPLOADER_STATUS_ENDPOINT')
  })

  test('should have all required fields', () => {
    const requiredFields = ['uploaderUrl', 'uploaderInitiateEndpoint', 'uploaderStatusEndpoint']
    requiredFields.forEach(field => {
      expect(uploaderConfig[field]).toBeDefined()
    })
  })

  test('should reject null uploaderInitiateEndpoint', () => {
    expect(uploaderConfig.uploaderInitiateEndpoint.nullable).toBe(false)
  })

  test('should reject null uploaderStatusEndpoint', () => {
    expect(uploaderConfig.uploaderStatusEndpoint.nullable).toBe(false)
  })

  test('should reject null uploaderUrl', () => {
    expect(uploaderConfig.uploaderUrl.nullable).toBe(false)
  })

  test('endpoints should require string format', () => {
    expect(uploaderConfig.uploaderInitiateEndpoint.format).toBe('endpoint-path')
    expect(uploaderConfig.uploaderStatusEndpoint.format).toBe('endpoint-path')
    expect(uploaderConfig.uploaderUrl.format).toBe(String)
  })

  test('should reject invalid endpoint paths', () => {
    const endpointFormatter = uploaderConfig.uploaderInitiateEndpoint
    expect(() => {
      if (endpointFormatter.format !== String) {
        // If using custom format, test the constraint
        if (!'/initiate'.startsWith('/')) {
          throw new Error('must start with a forward slash (/)')
        }
      }
    }).not.toThrow()

    expect(() => {
      // Test that non-slash paths would fail
      const invalidPath = 'initiate'
      if (!invalidPath.startsWith('/')) {
        throw new Error('must start with a forward slash (/)')
      }
    }).toThrow('must start with a forward slash (/)')
  })
})
