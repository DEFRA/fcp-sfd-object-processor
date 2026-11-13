import { vi, describe, test, expect, beforeEach } from 'vitest'
import { handleValidationFailure } from '../../../../../../src/api/v1/callback/validation/handle-validation-failure.js'
import { persistValidationFailureStatus } from '../../../../../../src/services/metadata-service.js'

// Mock dependencies before importing the module under test
vi.mock('../../../../../../src/services/metadata-service.js', () => ({
  persistValidationFailureStatus: vi.fn(),
  persistMetadataWithOutbox: vi.fn()
}))

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}))

vi.mock('../../../../../../src/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

const CORRELATION_ID = '550e8400-e29b-41d4-a716-446655440000'

describe('handleValidationFailure', () => {
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()

    mockH = {
      response: vi.fn().mockReturnValue({
        code: vi.fn().mockReturnValue({ takeover: vi.fn() })
      })
    }
  })

  test('persists validation failure status', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    await handleValidationFailure(payload, error, undefined, mockH, CORRELATION_ID)

    expect(persistValidationFailureStatus).toHaveBeenCalledWith(payload, error, CORRELATION_ID)
  })

  test('returns 201 response via Hapi response toolkit', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    await handleValidationFailure(payload, error, undefined, mockH, CORRELATION_ID)

    expect(mockH.response).toHaveBeenCalledWith({ message: 'Validation failure persisted' })
    expect(mockH.response().code).toHaveBeenCalledWith(201)
  })

  test('logs file details when file with fileId is provided', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error("fileStatus must be 'complete' but was 'rejected'")
    const file = { fileId: 'abc-123', fileStatus: 'rejected' }

    await handleValidationFailure(payload, error, file, mockH, CORRELATION_ID)

    expect(persistValidationFailureStatus).toHaveBeenCalledWith(payload, error, CORRELATION_ID)
    expect(mockLogger.error).toHaveBeenCalledWith({
      event: {
        type: 'callback_contract_validation_failure',
        outcome: 'failure',
        reference: 'abc-123',
        reason: 'rejected'
      },
      error: { message: "fileStatus must be 'complete' but was 'rejected'" },
      tenant: { message: null }
    }, 'File upload contract validation failed')
  })

  test('logs upload status when no file is provided', async () => {
    const payload = { uploadStatus: 'pending' }
    const error = new Error("uploadStatus must be 'ready' but was 'pending'")

    await handleValidationFailure(payload, error, undefined, mockH, CORRELATION_ID)

    expect(mockLogger.error).toHaveBeenCalledWith({
      event: {
        type: 'callback_contract_validation_failure',
        outcome: 'failure',
        reference: undefined,
        reason: 'pending'
      },
      error: { message: "uploadStatus must be 'ready' but was 'pending'" },
      tenant: { message: null }
    }, 'File upload contract validation failed')
  })

  test('does not throw when file is undefined', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    await expect(
      handleValidationFailure(payload, error, undefined, mockH, CORRELATION_ID)
    ).resolves.not.toThrow()
  })

  test('does not throw when file has no fileId', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')
    const file = { fileStatus: 'complete' }

    await expect(
      handleValidationFailure(payload, error, file, mockH, CORRELATION_ID)
    ).resolves.not.toThrow()
  })

  test('does not throw when persistValidationFailureStatus rejects', async () => {
    persistValidationFailureStatus.mockRejectedValueOnce(new Error('DB error'))

    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    await expect(
      handleValidationFailure(payload, error, undefined, mockH, CORRELATION_ID)
    ).resolves.not.toThrow()
  })

  test('returns fallback object when h is null', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    const result = await handleValidationFailure(payload, error, undefined, null, CORRELATION_ID)

    expect(result).toEqual({
      status: 201,
      body: { message: 'Validation failure persisted' }
    })
  })

  test('returns fallback object when h has no response function', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    const result = await handleValidationFailure(payload, error, undefined, {}, CORRELATION_ID)

    expect(result).toEqual({
      status: 201,
      body: { message: 'Validation failure persisted' }
    })
  })

  test('includes sourceSystem in tenant.message on the file-validation-failed log when present', async () => {
    const payload = { uploadStatus: 'ready', metadata: { service: 'fcp-sfd-frontend' } }
    const error = new Error('checksum invalid')
    const file = { fileId: 'abc-123', fileStatus: 'complete' }

    await handleValidationFailure(payload, error, file, mockH, CORRELATION_ID)

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ tenant: { message: 'sourceSystem=fcp-sfd-frontend' } }),
      'File upload contract validation failed'
    )
  })

  test('omits sourceSystem from tenant.message on the file-validation-failed log when absent', async () => {
    const payload = { uploadStatus: 'ready', metadata: {} }
    const error = new Error('checksum invalid')
    const file = { fileId: 'abc-123', fileStatus: 'complete' }

    await handleValidationFailure(payload, error, file, mockH, CORRELATION_ID)

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ tenant: { message: null } }),
      'File upload contract validation failed'
    )
  })

  test('includes sourceSystem in tenant.message when persistValidationFailureStatus rejects', async () => {
    persistValidationFailureStatus.mockRejectedValueOnce(new Error('DB error'))

    const payload = { uploadStatus: 'ready', metadata: { service: 'rps-portal' } }
    const error = new Error('test error')

    await handleValidationFailure(payload, error, undefined, mockH, CORRELATION_ID)

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ tenant: { message: 'sourceSystem=rps-portal' } }),
      'Failed to persist status for semantic validation failure'
    )
  })
})
