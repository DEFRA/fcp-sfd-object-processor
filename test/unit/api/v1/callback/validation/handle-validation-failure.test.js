import { vi, describe, test, expect, beforeEach } from 'vitest'

import { handleValidationFailure } from '../../../../../../src/api/v1/callback/validation/handle-validation-failure.js'
import { persistValidationFailureStatus } from '../../../../../../src/services/metadata-service.js'

// Mock dependencies before importing the module under test
vi.mock('../../../../../../src/services/metadata-service.js', () => ({
  persistValidationFailureStatus: vi.fn(),
  persistMetadataWithOutbox: vi.fn()
}))

vi.mock('../../../../../../src/logging/logger.js', () => ({
  createLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  })
}))

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

    await handleValidationFailure(payload, error, undefined, mockH)

    expect(persistValidationFailureStatus).toHaveBeenCalledWith(payload, error)
  })

  test('returns 201 response via Hapi response toolkit', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    await handleValidationFailure(payload, error, undefined, mockH)

    expect(mockH.response).toHaveBeenCalledWith({ message: 'Validation failure persisted' })
    expect(mockH.response().code).toHaveBeenCalledWith(201)
  })

  test('logs file details when file with fileId is provided', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('checksum invalid')
    const file = { fileId: 'abc-123', fileStatus: 'complete' }

    // Should not throw
    await handleValidationFailure(payload, error, file, mockH)

    expect(persistValidationFailureStatus).toHaveBeenCalledWith(payload, error)
  })

  test('does not throw when file is undefined', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    await expect(
      handleValidationFailure(payload, error, undefined, mockH)
    ).resolves.not.toThrow()
  })

  test('does not throw when file has no fileId', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')
    const file = { fileStatus: 'complete' }

    await expect(
      handleValidationFailure(payload, error, file, mockH)
    ).resolves.not.toThrow()
  })

  test('does not throw when persistValidationFailureStatus rejects', async () => {
    persistValidationFailureStatus.mockRejectedValueOnce(new Error('DB error'))

    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    await expect(
      handleValidationFailure(payload, error, undefined, mockH)
    ).resolves.not.toThrow()
  })

  test('returns fallback object when h is null', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    const result = await handleValidationFailure(payload, error, undefined, null)

    expect(result).toEqual({
      status: 201,
      body: { message: 'Validation failure persisted' }
    })
  })

  test('returns fallback object when h has no response function', async () => {
    const payload = { uploadStatus: 'ready' }
    const error = new Error('test error')

    const result = await handleValidationFailure(payload, error, undefined, {})

    expect(result).toEqual({
      status: 201,
      body: { message: 'Validation failure persisted' }
    })
  })
})
