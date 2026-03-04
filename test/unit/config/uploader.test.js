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
    expect(uploaderConfig.uploaderInitiateEndpoint.format).toBe(String)
    expect(uploaderConfig.uploaderInitiateEndpoint.nullable).toBe(false)
    expect(uploaderConfig.uploaderInitiateEndpoint.default).toBe('/initiate')
    expect(uploaderConfig.uploaderInitiateEndpoint.env).toBe('CDP_UPLOADER_INITIATE_ENDPOINT')
  })

  test('should have uploaderStatusEndpoint field with default', () => {
    expect(uploaderConfig.uploaderStatusEndpoint).toBeDefined()
    expect(uploaderConfig.uploaderStatusEndpoint.doc).toBe('The endpoint path for checking scan completion status')
    expect(uploaderConfig.uploaderStatusEndpoint.format).toBe(String)
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
})
