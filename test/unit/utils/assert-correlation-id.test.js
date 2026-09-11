import { describe, expect, test } from 'vitest'

import { assertCorrelationId } from '../../../src/utils/assert-correlation-id.js'

const VALID_CORRELATION_ID = '550e8400-e29b-41d4-a716-446655440000'
const UUID_V1 = '123e4567-e89b-12d3-a456-426655440000'
const BRACE_WRAPPED = '{550e8400-e29b-41d4-a716-446655440000}'

describe('assertCorrelationId', () => {
  test('returns a valid v4 UUID unchanged', () => {
    expect(assertCorrelationId(VALID_CORRELATION_ID)).toBe(VALID_CORRELATION_ID)
  })

  test('does not throw for a valid v4 UUID', () => {
    expect(() => assertCorrelationId(VALID_CORRELATION_ID)).not.toThrow()
  })

  test('throws when the correlation id is undefined', () => {
    expect(() => assertCorrelationId(undefined)).toThrow(/must be a v4 UUID/)
  })

  test('throws when the correlation id is omitted entirely', () => {
    expect(() => assertCorrelationId()).toThrow(/must be a v4 UUID/)
  })

  test('throws when the correlation id is null', () => {
    expect(() => assertCorrelationId(null)).toThrow(/must be a v4 UUID/)
  })

  test('throws when the correlation id is an empty string', () => {
    expect(() => assertCorrelationId('')).toThrow(/must be a v4 UUID/)
  })

  test('throws when the correlation id is whitespace only', () => {
    expect(() => assertCorrelationId('   ')).toThrow(/must be a v4 UUID/)
  })

  test('throws when the correlation id is a number', () => {
    expect(() => assertCorrelationId(12345)).toThrow(/must be a v4 UUID/)
  })

  test('throws when the correlation id is an object', () => {
    expect(() => assertCorrelationId({ correlationId: VALID_CORRELATION_ID })).toThrow(/must be a v4 UUID/)
  })

  test('throws when the correlation id is a string that is not a UUID', () => {
    expect(() => assertCorrelationId('not-a-uuid')).toThrow(/must be a v4 UUID/)
  })

  test('throws when the correlation id is a well formed UUID of the wrong version', () => {
    expect(() => assertCorrelationId(UUID_V1)).toThrow(/must be a v4 UUID/)
  })

  test('names the received type in the message rather than the value', () => {
    expect(() => assertCorrelationId(12345)).toThrow(/received type number/)
    expect(() => assertCorrelationId(12345)).not.toThrow(/12345/)
  })

  // Joi's guid() accepts the brace-wrapped Microsoft form. The same rule guards the journey id
  // in journey-correlation-service.js and the correlationId path parameter on
  // GET /api/v1/status/{correlationId}, so one definition of a valid identifier holds across
  // the chain. Asserted so the behaviour is a recorded decision rather than a surprise: a
  // brace-wrapped id cannot reach this guard in practice, because the only producers are
  // randomUUID() and resolveJourneyId, which falls back to randomUUID() when its lookup misses.
  test('accepts a brace-wrapped v4 GUID, matching the guid() rule used elsewhere in the service', () => {
    expect(assertCorrelationId(BRACE_WRAPPED)).toBe(BRACE_WRAPPED)
  })
})
