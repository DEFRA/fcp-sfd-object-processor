import { describe, expect, test } from 'vitest'

import { splitJourneyId } from '../../../src/utils/split-journey-id.js'

const JOURNEY_ID = '550e8400-e29b-41d4-a716-446655440000'

describe('splitJourneyId', () => {
  test('separates the journey id from a metadata object that carries it', () => {
    const result = splitJourneyId({ sbi: 105000000, submissionId: '1733826312', journeyId: JOURNEY_ID })

    expect(result).toEqual({
      journeyId: JOURNEY_ID,
      metadata: { sbi: 105000000, submissionId: '1733826312' }
    })
  })

  test('returns metadata with the journeyId key removed, not merely set to undefined', () => {
    const result = splitJourneyId({ sbi: 105000000, journeyId: JOURNEY_ID })

    expect('journeyId' in result.metadata).toBe(false)
  })

  test('returns journeyId undefined and an equal, distinct copy when the key is absent', () => {
    const metadata = { sbi: 105000000, submissionId: '1733826312' }

    const result = splitJourneyId(metadata)

    expect(result.journeyId).toBeUndefined()
    expect(result.metadata).toEqual(metadata)
    expect(result.metadata).not.toBe(metadata)
  })

  test('does not mutate the input object', () => {
    const metadata = { sbi: 105000000, journeyId: JOURNEY_ID }

    splitJourneyId(metadata)

    expect(metadata).toEqual({ sbi: 105000000, journeyId: JOURNEY_ID })
  })

  test('handles an undefined input without throwing', () => {
    expect(() => splitJourneyId(undefined)).not.toThrow()
    expect(splitJourneyId(undefined)).toEqual({ journeyId: undefined, metadata: {} })
  })

  test('handles a null input without throwing', () => {
    expect(() => splitJourneyId(null)).not.toThrow()
    expect(splitJourneyId(null)).toEqual({ journeyId: undefined, metadata: {} })
  })
})
