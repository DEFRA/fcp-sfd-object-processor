import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

vi.mock('../../../src/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

vi.mock('../../../src/repos/sessions.js', () => ({
  getSessionByJourneyId: vi.fn()
}))

const { resolveJourneyId } = await import('../../../src/services/journey-correlation-service.js')
const { getSessionByJourneyId } = await import('../../../src/repos/sessions.js')

const VALID_JOURNEY_ID = '550e8400-e29b-41d4-a716-446655440000'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const payloadMetadata = { sbi: 105000000, submissionId: '1733826312' }

const expectGenerated = (result, rawJourneyId) => {
  expect(result.source).toBe('generated')
  expect(result.journeyId).toMatch(UUID_V4)
  expect(result.journeyId).not.toBe(rawJourneyId)
}

const expectUnresolvedWarning = (reason) => {
  expect(mockLogger.warn).toHaveBeenCalledWith(
    expect.objectContaining({
      event: expect.objectContaining({
        type: 'callback_journey_id_unresolved',
        outcome: 'failure',
        reason
      })
    }),
    expect.any(String)
  )
}

describe('journey-correlation-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when the journey id resolves', () => {
    test('returns the supplied id when the session matches on sbi and submissionId', async () => {
      getSessionByJourneyId.mockResolvedValue({ uploadId: 'upload-1', metadata: { ...payloadMetadata } })

      const result = await resolveJourneyId(VALID_JOURNEY_ID, payloadMetadata)

      expect(result).toEqual({ journeyId: VALID_JOURNEY_ID, source: 'session' })
      expect(getSessionByJourneyId).toHaveBeenCalledWith(VALID_JOURNEY_ID)
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })

    test('accepts an uppercase v4 UUID', async () => {
      const upper = VALID_JOURNEY_ID.toUpperCase()
      getSessionByJourneyId.mockResolvedValue({ metadata: { ...payloadMetadata } })

      const result = await resolveJourneyId(upper, payloadMetadata)

      expect(result).toEqual({ journeyId: upper, source: 'session' })
    })
  })

  describe('when the journey id is missing or malformed', () => {
    test('generates an id when the value is undefined', async () => {
      const result = await resolveJourneyId(undefined, payloadMetadata)

      expectGenerated(result)
      expectUnresolvedWarning('missing_or_malformed_journey_id')
      expect(getSessionByJourneyId).not.toHaveBeenCalled()
    })

    test('generates an id when the value is not a string', async () => {
      const result = await resolveJourneyId(12345, payloadMetadata)

      expectGenerated(result)
      expect(getSessionByJourneyId).not.toHaveBeenCalled()
    })

    test('generates an id when the value is not a v4 UUID', async () => {
      const result = await resolveJourneyId('not-a-uuid', payloadMetadata)

      expectGenerated(result, 'not-a-uuid')
      expectUnresolvedWarning('missing_or_malformed_journey_id')
      expect(getSessionByJourneyId).not.toHaveBeenCalled()
    })

    test('generates an id when the value is an empty string', async () => {
      const result = await resolveJourneyId('', payloadMetadata)

      expectGenerated(result)
      expect(getSessionByJourneyId).not.toHaveBeenCalled()
    })

    test('generates an id for a UUID of the wrong version', async () => {
      // Version nibble is 1, not 4.
      const v1 = '550e8400-e29b-11d4-a716-446655440000'
      const result = await resolveJourneyId(v1, payloadMetadata)

      expectGenerated(result, v1)
      expect(getSessionByJourneyId).not.toHaveBeenCalled()
    })

    test('generates an id for a UUID with an invalid variant nibble', async () => {
      // Variant nibble must be 8, 9, a or b.
      const bad = '550e8400-e29b-41d4-c716-446655440000'
      const result = await resolveJourneyId(bad, payloadMetadata)

      expectGenerated(result, bad)
      expect(getSessionByJourneyId).not.toHaveBeenCalled()
    })

    test('generates an id when a surrounding-whitespace value is supplied', async () => {
      const padded = ` ${VALID_JOURNEY_ID} `
      const result = await resolveJourneyId(padded, payloadMetadata)

      expectGenerated(result, padded)
      expect(getSessionByJourneyId).not.toHaveBeenCalled()
    })

    test('a brace-wrapped GUID passes format validation but resolves to a generated id', async () => {
      // Joi's guid() accepts the brace-delimited registry format. It is not what this
      // service stores, so the lookup finds nothing and the caller degrades safely.
      getSessionByJourneyId.mockResolvedValue(null)
      const braced = `{${VALID_JOURNEY_ID}}`

      const result = await resolveJourneyId(braced, payloadMetadata)

      expectGenerated(result, braced)
      expectUnresolvedWarning('no_session_found')
    })
  })

  describe('when the session cannot be verified', () => {
    test('generates an id when no session is found', async () => {
      getSessionByJourneyId.mockResolvedValue(null)

      const result = await resolveJourneyId(VALID_JOURNEY_ID, payloadMetadata)

      expectGenerated(result, VALID_JOURNEY_ID)
      expectUnresolvedWarning('no_session_found')
    })

    test('generates an id when the session sbi does not match', async () => {
      getSessionByJourneyId.mockResolvedValue({
        metadata: { sbi: 999999999, submissionId: payloadMetadata.submissionId }
      })

      const result = await resolveJourneyId(VALID_JOURNEY_ID, payloadMetadata)

      expectGenerated(result, VALID_JOURNEY_ID)
      expectUnresolvedWarning('session_metadata_mismatch')
    })

    test('generates an id when the session submissionId does not match', async () => {
      getSessionByJourneyId.mockResolvedValue({
        metadata: { sbi: payloadMetadata.sbi, submissionId: 'a-different-submission' }
      })

      const result = await resolveJourneyId(VALID_JOURNEY_ID, payloadMetadata)

      expectGenerated(result, VALID_JOURNEY_ID)
      expectUnresolvedWarning('session_metadata_mismatch')
    })

    test('generates an id when the session has no metadata', async () => {
      getSessionByJourneyId.mockResolvedValue({ uploadId: 'upload-1' })

      const result = await resolveJourneyId(VALID_JOURNEY_ID, payloadMetadata)

      expectGenerated(result, VALID_JOURNEY_ID)
      expectUnresolvedWarning('session_metadata_mismatch')
    })

    test('generates an id when the callback payload has no metadata', async () => {
      getSessionByJourneyId.mockResolvedValue({ metadata: { ...payloadMetadata } })

      const result = await resolveJourneyId(VALID_JOURNEY_ID, undefined)

      expectGenerated(result, VALID_JOURNEY_ID)
      expectUnresolvedWarning('session_metadata_mismatch')
    })
  })

  describe('when the session lookup fails', () => {
    test('generates an id and does not throw', async () => {
      getSessionByJourneyId.mockRejectedValue(new Error('MongoNetworkError'))

      const result = await resolveJourneyId(VALID_JOURNEY_ID, payloadMetadata)

      expectGenerated(result, VALID_JOURNEY_ID)
      expectUnresolvedWarning('session_lookup_failed')
    })

    test('includes the underlying error message in the warning', async () => {
      getSessionByJourneyId.mockRejectedValue(new Error('MongoNetworkError'))

      await resolveJourneyId(VALID_JOURNEY_ID, payloadMetadata)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: { message: 'MongoNetworkError' } }),
        expect.any(String)
      )
    })
  })
})
