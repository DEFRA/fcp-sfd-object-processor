import { describe, expect, test, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSessionByJourneyId: vi.fn(),
  loggerWarn: vi.fn(),
  randomUUID: vi.fn()
}))

vi.mock('../../../src/repos/sessions.js', () => ({
  getSessionByJourneyId: mocks.getSessionByJourneyId
}))

vi.mock('../../../src/logging/logger.js', () => ({
  createLogger: () => ({
    warn: mocks.loggerWarn,
    error: vi.fn(),
    info: vi.fn()
  })
}))

vi.mock('node:crypto', () => ({
  randomUUID: mocks.randomUUID
}))

const { resolveJourneyId } = await import('../../../src/services/journey-correlation-service.js')

const validJourneyId = '550e8400-e29b-41d4-a716-446655440000'
const generatedJourneyId = '11111111-2222-4333-8444-555555555555'
const payloadMetadata = { sbi: 105000000, submissionId: 'sub-123' }

describe('resolveJourneyId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.randomUUID.mockReturnValue(generatedJourneyId)
  })

  test('resolves from the session when the journeyId is a valid UUID and sbi/submissionId match', async () => {
    mocks.getSessionByJourneyId.mockResolvedValue({ metadata: payloadMetadata })

    const result = await resolveJourneyId(validJourneyId, payloadMetadata)

    expect(result).toEqual({ journeyId: validJourneyId, source: 'session' })
    expect(mocks.getSessionByJourneyId).toHaveBeenCalledWith(validJourneyId)
  })

  test('generates a new id when rawJourneyId is undefined', async () => {
    const result = await resolveJourneyId(undefined, payloadMetadata)

    expect(result).toEqual({ journeyId: generatedJourneyId, source: 'generated' })
    expect(mocks.getSessionByJourneyId).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ type: 'callback_journey_id_unresolved', reason: 'missing_or_malformed_journey_id' })
      }),
      expect.any(String)
    )
  })

  test('generates a new id when rawJourneyId is not a valid UUID', async () => {
    const result = await resolveJourneyId('not-a-uuid', payloadMetadata)

    expect(result).toEqual({ journeyId: generatedJourneyId, source: 'generated' })
    expect(mocks.getSessionByJourneyId).not.toHaveBeenCalled()
  })

  test('generates a new id when the journeyId is well-formed but no session exists', async () => {
    mocks.getSessionByJourneyId.mockResolvedValue(null)

    const result = await resolveJourneyId(validJourneyId, payloadMetadata)

    expect(result).toEqual({ journeyId: generatedJourneyId, source: 'generated' })
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ type: 'callback_journey_id_unresolved', reason: 'no_session_found' })
      }),
      expect.any(String)
    )
  })

  test('generates a new id when the session sbi does not match the payload sbi', async () => {
    mocks.getSessionByJourneyId.mockResolvedValue({ metadata: { ...payloadMetadata, sbi: 999999999 } })

    const result = await resolveJourneyId(validJourneyId, payloadMetadata)

    expect(result).toEqual({ journeyId: generatedJourneyId, source: 'generated' })
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ type: 'callback_journey_id_unresolved', reason: 'session_metadata_mismatch' })
      }),
      expect.any(String)
    )
  })

  test('generates a new id when the session submissionId does not match the payload submissionId', async () => {
    mocks.getSessionByJourneyId.mockResolvedValue({ metadata: { ...payloadMetadata, submissionId: 'different-sub' } })

    const result = await resolveJourneyId(validJourneyId, payloadMetadata)

    expect(result).toEqual({ journeyId: generatedJourneyId, source: 'generated' })
  })

  test('generates a new id and logs a warning without throwing when the session lookup rejects', async () => {
    mocks.getSessionByJourneyId.mockRejectedValue(new Error('Mongo connection lost'))

    const result = await resolveJourneyId(validJourneyId, payloadMetadata)

    expect(result).toEqual({ journeyId: generatedJourneyId, source: 'generated' })
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ type: 'callback_journey_id_unresolved', reason: 'session_lookup_failed' }),
        error: expect.objectContaining({ message: 'Mongo connection lost' })
      }),
      expect.any(String)
    )
  })
})
