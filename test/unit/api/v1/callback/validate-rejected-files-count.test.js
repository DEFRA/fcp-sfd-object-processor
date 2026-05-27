import { describe, test, expect, vi, beforeEach } from 'vitest'

import { validateCallbackPayload } from '../../../../../src/api/v1/callback/validation/validate-callback-payload.js'
import * as metricsModule from '../../../../../src/api/common/helpers/metrics.js'
import { baseMetadata, baseFileUpload1 } from '../../../../mocks/base-data.js'

vi.mock('../../../../../src/api/common/helpers/metrics.js', () => ({ metricsCounter: vi.fn() }))

const mockLogger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }))
vi.mock('../../../../../src/logging/logger.js', () => ({ createLogger: () => mockLogger }))

vi.mock('../../../../../src/services/metadata-service.js', () => ({
  persistValidationFailureStatus: vi.fn().mockResolvedValue(undefined)
}))

const rejectedFile = {
  fileId: '550e8400-e29b-41d4-a716-446655440001',
  filename: 'infected.pdf',
  contentType: 'application/pdf',
  fileStatus: 'rejected',
  hasError: true,
  errorMessage: 'File contains virus: Trojan.Generic'
}

const mockH = {
  response: (body) => ({ body, code: (status) => ({ status, body }) })
}

describe('numberOfRejectedFiles mismatch check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('no mismatch (declared=0, actual=0) does not log warning or emit metric', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: baseMetadata,
      numberOfRejectedFiles: 0,
      form: { 'good-file': baseFileUpload1, 'text-field': 'some text' }
    }

    await validateCallbackPayload(payload, mockH)

    expect(mockLogger.warn).not.toHaveBeenCalled()
    expect(metricsModule.metricsCounter).not.toHaveBeenCalledWith('op.callback.rejected_files_mismatch')
  })

  test('mismatch (declared=0, actual=1) logs structured warning and emits metric', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: baseMetadata,
      numberOfRejectedFiles: 0,
      form: { 'bad-file': rejectedFile, 'text-field': 'some text' }
    }

    await validateCallbackPayload(payload, mockH)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        event: {
          type: 'rejected_files_count_mismatch',
          action: 'callback_validation',
          category: 'observability',
          outcome: 'mismatch',
          reference: baseMetadata.uosr,
          expected: 0,
          actual: 1
        }
      },
      'numberOfRejectedFiles mismatch: declared=0, actual=1'
    )
    expect(metricsModule.metricsCounter).toHaveBeenCalledWith('op.callback.rejected_files_mismatch')
  })

  test('mismatch (declared=2, actual=1) logs warning with correct expected/actual values', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: baseMetadata,
      numberOfRejectedFiles: 2,
      form: { 'bad-file': rejectedFile }
    }

    await validateCallbackPayload(payload, mockH)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ expected: 2, actual: 1 })
      }),
      'numberOfRejectedFiles mismatch: declared=2, actual=1'
    )
    expect(metricsModule.metricsCounter).toHaveBeenCalledWith('op.callback.rejected_files_mismatch')
  })

  test('no mismatch (declared=1, actual=1) does not log warning or emit metric', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: baseMetadata,
      numberOfRejectedFiles: 1,
      form: { 'bad-file': rejectedFile }
    }

    await validateCallbackPayload(payload, mockH)

    expect(mockLogger.warn).not.toHaveBeenCalled()
    expect(metricsModule.metricsCounter).not.toHaveBeenCalledWith('op.callback.rejected_files_mismatch')
  })

  test('text fields in form are excluded from rejected file count', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: baseMetadata,
      numberOfRejectedFiles: 1,
      form: {
        'bad-file': rejectedFile,
        'text-field': 'not a file',
        'another-text': 'also not a file'
      }
    }

    await validateCallbackPayload(payload, mockH)

    expect(mockLogger.warn).not.toHaveBeenCalled()
    expect(metricsModule.metricsCounter).not.toHaveBeenCalledWith('op.callback.rejected_files_mismatch')
  })

  test('processing continues after mismatch — Stage 2 still handles non-complete files', async () => {
    const payload = {
      uploadStatus: 'ready',
      metadata: baseMetadata,
      numberOfRejectedFiles: 0,
      form: { 'bad-file': rejectedFile }
    }

    const result = await validateCallbackPayload(payload, mockH)

    expect(mockLogger.warn).toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result.status).toBe(201)
  })
})
