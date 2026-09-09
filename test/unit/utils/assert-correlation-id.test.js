import { describe, expect, test } from 'vitest'

import { assertCorrelationId } from '../../../src/utils/assert-correlation-id.js'

describe('assertCorrelationId', () => {
  test('accepts a non-empty string', () => {
    expect(() => assertCorrelationId('550e8400-e29b-41d4-a716-446655440000', 'someFunction')).not.toThrow()
  })

  test('throws when the correlationId is undefined', () => {
    expect(() => assertCorrelationId(undefined, 'someFunction'))
      .toThrow('someFunction requires an explicit correlationId')
  })

  test('throws when the correlationId is null', () => {
    expect(() => assertCorrelationId(null, 'someFunction'))
      .toThrow('someFunction requires an explicit correlationId')
  })

  test('throws when the correlationId is an empty string', () => {
    expect(() => assertCorrelationId('', 'someFunction'))
      .toThrow('someFunction requires an explicit correlationId')
  })

  test('throws when the correlationId is only whitespace', () => {
    expect(() => assertCorrelationId('   ', 'someFunction'))
      .toThrow('someFunction requires an explicit correlationId')
  })

  test('throws when the correlationId is not a string', () => {
    expect(() => assertCorrelationId(12345, 'someFunction'))
      .toThrow('someFunction requires an explicit correlationId')
  })

  test('names the calling function in the message', () => {
    expect(() => assertCorrelationId(undefined, 'formatInboundMetadata'))
      .toThrow('formatInboundMetadata requires an explicit correlationId')
  })
})
