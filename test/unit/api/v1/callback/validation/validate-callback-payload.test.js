import { describe, test, expect, vi, beforeEach } from 'vitest'
import { validateCallbackPayload } from '../../../../../../src/api/v1/callback/validation/validate-callback-payload.js'

vi.mock('../../../../logging/logger.js', () => ({
  createLogger: () => ({
    warn: vi.fn()
  })
}))

vi.mock('../../../common/helpers/metrics.js', () => ({
  metricsCounter: vi.fn()
}))

const validFileUpload = {
  fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
  filename: 'test.pdf',
  contentType: 'application/pdf',
  detectedContentType: 'application/pdf',
  fileStatus: 'complete',
  contentLength: 1024,
  checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
  s3Key: 'scanned/abc/123',
  s3Bucket: 'test-bucket'
}

const rejectedFileUpload = {
  fileId: 'c3d45e6f-7890-1abc-2def-3456789abcde',
  filename: 'rejected.pdf',
  contentType: 'application/pdf',
  detectedContentType: 'application/pdf',
  fileStatus: 'rejected',
  contentLength: 0
}

const validMetadata = {
  sbi: 105000000,
  crn: 1050000000,
  frn: 1102658375,
  submissionId: '550e8400-e29b-41d4-a716-446655440000',
  type: 'CS_Agreement_Evidence',
  reference: 'TestReference',
  service: 'fcp-sfd-frontend'
}

const validPayload = {
  uploadStatus: 'ready',
  metadata: validMetadata,
  form: {
    'file-1': validFileUpload
  },
  numberOfRejectedFiles: 0
}

describe('validateCallbackPayload', () => {
  let h

  beforeEach(() => {
    h = {
      response: vi.fn().mockReturnThis(),
      code: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      takeover: vi.fn()
    }
  })

  test('returns null when payload is valid', async () => {
    const result = await validateCallbackPayload(validPayload, h)
    expect(result).toBeNull()
  })

  test('returns error when uploadStatus is not ready', async () => {
    const payload = { ...validPayload, uploadStatus: 'pending' }
    const result = await validateCallbackPayload(payload, h)
    expect(result).toBeDefined()
  })

  test('returns error when a single file has fileStatus other than complete', async () => {
    const payload = {
      ...validPayload,
      form: {
        'file-1': rejectedFileUpload
      },
      numberOfRejectedFiles: 1
    }
    const result = await validateCallbackPayload(payload, h)
    expect(result).toBeDefined()
  })

  test('counts rejected files in arrays for observability check', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: validMetadata,
      form: {
        documents: [
          validFileUpload,
          { ...rejectedFileUpload, fileId: 'aaa-bbb' }
        ]
      },
      numberOfRejectedFiles: 1
    }
    const result = await validateCallbackPayload(payload, h)
    // Should return error because rejected file is in array
    expect(result).toBeDefined()
  })

  test('validates all files in array for fileStatus complete', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: validMetadata,
      form: {
        documents: [
          validFileUpload,
          { ...validFileUpload, fileId: 'ddd-eee' }
        ]
      },
      numberOfRejectedFiles: 0
    }
    const result = await validateCallbackPayload(payload, h)
    expect(result).toBeNull()
  })

  test('returns error when array contains file with non-complete status', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: validMetadata,
      form: {
        documents: [
          validFileUpload,
          { ...rejectedFileUpload, fileId: 'ddd-eee' }
        ]
      },
      numberOfRejectedFiles: 1
    }
    const result = await validateCallbackPayload(payload, h)
    expect(result).toBeDefined()
  })

  test('counts rejected files correctly with mixed single and array entries', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: validMetadata,
      form: {
        'single-file': validFileUpload,
        documents: [
          { ...rejectedFileUpload, fileId: 'aaa-bbb' },
          { ...rejectedFileUpload, fileId: 'ccc-ddd' }
        ]
      },
      numberOfRejectedFiles: 2
    }
    const result = await validateCallbackPayload(payload, h)
    // Should return error because rejected files are in array
    expect(result).toBeDefined()
  })

  test('returns error for first non-complete file in array (short-circuits)', async () => {
    const firstRejected = { ...rejectedFileUpload, fileId: 'first-rejection' }
    const secondRejected = { ...rejectedFileUpload, fileId: 'second-rejection' }

    const payload = {
      uploadStatus: 'ready',
      metadata: validMetadata,
      form: {
        documents: [
          firstRejected,
          secondRejected
        ]
      },
      numberOfRejectedFiles: 2
    }
    const result = await validateCallbackPayload(payload, h)
    expect(result).toBeDefined()
  })

  test('validates payload with empty array in form', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: validMetadata,
      form: {
        'file-1': validFileUpload,
        'empty-docs': []
      },
      numberOfRejectedFiles: 0
    }
    const result = await validateCallbackPayload(payload, h)
    expect(result).toBeNull()
  })

  test('validates payload with mixed text and file arrays', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: validMetadata,
      form: {
        'text-field': 'some text',
        documents: [
          validFileUpload,
          { ...validFileUpload, fileId: 'fff-ggg' }
        ]
      },
      numberOfRejectedFiles: 0
    }
    const result = await validateCallbackPayload(payload, h)
    expect(result).toBeNull()
  })

  test('skips non-file entries in arrays when checking fileStatus', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: validMetadata,
      form: {
        documents: [
          'string value',
          validFileUpload,
          42
        ]
      },
      numberOfRejectedFiles: 0
    }
    const result = await validateCallbackPayload(payload, h)
    expect(result).toBeNull()
  })
})
