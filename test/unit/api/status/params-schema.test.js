import { describe, expect, test } from 'vitest'

import { statusParamSchema } from '../../../../src/api/v1/status/schemas/params.js'

describe('statusParamSchema', () => {
  test('valid UUID v4 passes validation', () => {
    const result = statusParamSchema.validate({
      correlationId: '550e8400-e29b-41d4-a716-446655440000'
    })

    expect(result.error).toBeUndefined()
    expect(result.value.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  test('another valid UUID v4 passes validation', () => {
    const result = statusParamSchema.validate({
      correlationId: '123e4567-e89b-42d3-a456-426655440000'
    })

    expect(result.error).toBeUndefined()
  })

  test('invalid UUID format fails validation', () => {
    const result = statusParamSchema.validate({
      correlationId: 'not-a-valid-uuid'
    })

    expect(result.error).toBeDefined()
    expect(result.error.message).toBe('The correlationId must be a valid UUID v4.')
  })

  test('empty string fails validation', () => {
    const result = statusParamSchema.validate({
      correlationId: ''
    })

    expect(result.error).toBeDefined()
  })

  test('missing correlationId fails validation', () => {
    const result = statusParamSchema.validate({})

    expect(result.error).toBeDefined()
    expect(result.error.message).toBe('The correlationId is required.')
  })

  test('UUID v1 format fails validation', () => {
    const result = statusParamSchema.validate({
      correlationId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
    })

    expect(result.error).toBeDefined()
  })

  test('numeric value fails validation', () => {
    const result = statusParamSchema.validate({
      correlationId: 12345
    })

    expect(result.error).toBeDefined()
  })
})
