import { describe, test, expect } from 'vitest'
import { buildFallbackValidationError } from '../../../src/mappers/status.js'

describe('buildFallbackValidationError - errorType field cap', () => {
  test('should cap errorType at 256 chars when message exceeds limit', () => {
    const longMessage = 'x'.repeat(500)
    const error = { message: longMessage }

    const result = buildFallbackValidationError(error)

    expect(result.errorType).toBe('x'.repeat(256))
    expect(result.errorType.length).toBe(256)
  })

  test('should preserve message under 256 chars', () => {
    const shortMessage = 'This is a short error message'
    const error = { message: shortMessage }

    const result = buildFallbackValidationError(error)

    expect(result.errorType).toBe(shortMessage)
  })

  test('should use default message when error message is missing', () => {
    const result = buildFallbackValidationError({})

    expect(result.errorType).toBe('Validation failed')
  })

  test('should use default message when error message is empty', () => {
    const result = buildFallbackValidationError({ message: '' })

    expect(result.errorType).toBe('Validation failed')
  })

  test('should cap exactly at 256 chars', () => {
    const exactMessage = 'a'.repeat(256)
    const result = buildFallbackValidationError({ message: exactMessage })

    expect(result.errorType).toBe(exactMessage)
    expect(result.errorType.length).toBe(256)
  })

  test('should handle 1MB injection attempt from untrusted source', () => {
    const injectionAttempt = 'x'.repeat(1_000_000) // 1MB
    const result = buildFallbackValidationError({ message: injectionAttempt })

    expect(result.errorType.length).toBe(256)
    expect(result.errorType).toBe('x'.repeat(256))
  })
})
