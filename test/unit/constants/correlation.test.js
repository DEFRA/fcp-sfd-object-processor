import { describe, expect, test } from 'vitest'

import { JOURNEY_ID_PARAM, UUID_V4_PATTERN } from '../../../src/constants/correlation.js'

describe('correlation constants', () => {
  test('defines the journey id query parameter name', () => {
    expect(JOURNEY_ID_PARAM).toBe('journeyId')
  })

  test('UUID_V4_PATTERN matches a valid v4 UUID', () => {
    expect(UUID_V4_PATTERN.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  test('UUID_V4_PATTERN matches a valid v4 UUID in uppercase', () => {
    expect(UUID_V4_PATTERN.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  test('UUID_V4_PATTERN rejects a non-UUID string', () => {
    expect(UUID_V4_PATTERN.test('not-a-uuid')).toBe(false)
  })

  test('UUID_V4_PATTERN rejects a v1 UUID (wrong version nibble)', () => {
    expect(UUID_V4_PATTERN.test('550e8400-e29b-11d4-a716-446655440000')).toBe(false)
  })
})
