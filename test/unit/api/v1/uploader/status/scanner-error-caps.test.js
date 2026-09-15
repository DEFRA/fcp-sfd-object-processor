import { describe, test, expect } from 'vitest'
import { extractScannerErrors } from '../../../../../../src/api/v1/uploader/status/index.js'

describe('extractScannerErrors - unbounded field caps', () => {
  test('should cap filename at 256 chars when oversized', () => {
    const form = {
      'huge-file': {
        fileStatus: 'rejected',
        filename: 'x'.repeat(500),
        errorCode: 'VIRUS_DETECTED'
      }
    }

    const result = extractScannerErrors(form)

    expect(result).toHaveLength(1)
    expect(result[0].field).toBe('x'.repeat(256))
    expect(result[0].field.length).toBe(256)
  })

  test('should cap errorCode at 256 chars when oversized', () => {
    const form = {
      file: {
        fileStatus: 'rejected',
        filename: 'document.pdf',
        errorCode: 'y'.repeat(500)
      }
    }

    const result = extractScannerErrors(form)

    expect(result).toHaveLength(1)
    expect(result[0].errorType).toBe('y'.repeat(256))
    expect(result[0].errorType.length).toBe(256)
  })

  test('should cap errorMessage at 256 chars when oversized', () => {
    const form = {
      file: {
        fileStatus: 'rejected',
        filename: 'document.pdf',
        errorMessage: 'z'.repeat(500)
      }
    }

    const result = extractScannerErrors(form)

    expect(result).toHaveLength(1)
    expect(result[0].errorType).toBe('z'.repeat(256))
    expect(result[0].errorType.length).toBe(256)
  })

  test('should prefer capped errorCode over capped errorMessage', () => {
    const form = {
      file: {
        fileStatus: 'rejected',
        filename: 'document.pdf',
        errorCode: 'a'.repeat(500),
        errorMessage: 'b'.repeat(500)
      }
    }

    const result = extractScannerErrors(form)

    expect(result[0].errorType).toBe('a'.repeat(256))
  })

  test('should use default filename when missing', () => {
    const form = {
      file: {
        fileStatus: 'rejected',
        errorCode: 'ERROR'
      }
    }

    const result = extractScannerErrors(form)

    expect(result[0].field).toBe('file')
  })

  test('should use REJECTED_BY_SCANNER when no error code or message', () => {
    const form = {
      file: {
        fileStatus: 'rejected',
        filename: 'document.pdf'
      }
    }

    const result = extractScannerErrors(form)

    expect(result[0].errorType).toMatch(/rejected|REJECTED/)
  })

  test('should handle multiple rejected files with all fields capped', () => {
    const form = {
      file1: {
        fileStatus: 'rejected',
        filename: 'x'.repeat(300),
        errorCode: 'y'.repeat(300)
      },
      file2: {
        fileStatus: 'rejected',
        filename: 'a'.repeat(300),
        errorMessage: 'b'.repeat(300)
      }
    }

    const result = extractScannerErrors(form)

    expect(result).toHaveLength(2)
    expect(result[0].field.length).toBe(256)
    expect(result[0].errorType.length).toBe(256)
    expect(result[1].field.length).toBe(256)
    expect(result[1].errorType.length).toBe(256)
  })

  test('should handle defense-in-depth: reject huge CDP Uploader response', () => {
    // Simulate malicious CDP Uploader sending huge error fields
    const form = {
      file: {
        fileStatus: 'rejected',
        filename: 'x'.repeat(100_000),
        errorCode: 'y'.repeat(100_000),
        errorMessage: 'z'.repeat(100_000)
      }
    }

    const result = extractScannerErrors(form)

    expect(result[0].field.length).toBeLessThanOrEqual(256)
    expect(result[0].errorType.length).toBeLessThanOrEqual(256)
  })
})
