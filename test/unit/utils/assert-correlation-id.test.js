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

  // Joi's guid() accepts the brace-wrapped Microsoft form, which is why this guard uses an
  // explicit pattern instead. A brace-wrapped id would be written to the document and
  // published to CRM in a shape that no longer matches the plain id stored on the session,
  // so the upload could not be joined end to end and the correlation would break silently.
  test('rejects a brace-wrapped v4 GUID, which would not match the id stored on the session', () => {
    expect(() => assertCorrelationId(BRACE_WRAPPED)).toThrow(/must be a v4 UUID/)
  })

  test('does not name the received value when rejecting a brace-wrapped GUID', () => {
    expect(() => assertCorrelationId(BRACE_WRAPPED)).not.toThrow(/550e8400/)
  })
})
