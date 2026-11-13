import { describe, test, expect } from 'vitest'
import { toTenantMessage, sanitizeSourceSystem } from '../../../src/logging/tenant-message.js'

describe('toTenantMessage', () => {
  test('joins entries as key=value pairs separated by spaces', () => {
    expect(toTenantMessage({ fileId: 'f1', attempts: 2 })).toBe('fileId=f1 attempts=2')
  })

  test('omits null values', () => {
    expect(toTenantMessage({ fileId: 'f1', cause: null })).toBe('fileId=f1')
  })

  test('omits undefined values', () => {
    expect(toTenantMessage({ fileId: 'f1', cause: undefined })).toBe('fileId=f1')
  })

  test('returns null for an empty object', () => {
    expect(toTenantMessage({})).toBeNull()
  })

  test('returns null when every value is null or undefined', () => {
    expect(toTenantMessage({ a: null, b: undefined })).toBeNull()
  })

  test('preserves falsy-but-present values such as 0 and empty string', () => {
    expect(toTenantMessage({ attempts: 0, note: '' })).toBe('attempts=0 note=')
  })
})

describe('sanitizeSourceSystem', () => {
  test('returns the value unchanged when it is an allowed source system', () => {
    expect(sanitizeSourceSystem('fcp-sfd-frontend')).toBe('fcp-sfd-frontend')
    expect(sanitizeSourceSystem('rps-portal')).toBe('rps-portal')
  })

  test('returns undefined when the value is a string not on the allow list', () => {
    expect(sanitizeSourceSystem('unknown-service')).toBeUndefined()
  })

  test('returns undefined rather than a forged second pair when the value contains a key=value pair', () => {
    const forged = 'rps-portal sourceSystem=fcp-sfd-frontend'
    expect(sanitizeSourceSystem(forged)).toBeUndefined()
    expect(toTenantMessage({ sourceSystem: sanitizeSourceSystem(forged) })).toBeNull()
  })

  test('returns undefined when the value is missing', () => {
    expect(sanitizeSourceSystem(undefined)).toBeUndefined()
  })

  test('returns undefined when the value is null', () => {
    expect(sanitizeSourceSystem(null)).toBeUndefined()
  })

  test('returns undefined when the value is not a string', () => {
    expect(sanitizeSourceSystem(123)).toBeUndefined()
    expect(sanitizeSourceSystem({})).toBeUndefined()
    expect(sanitizeSourceSystem(true)).toBeUndefined()
  })

  test('combines with toTenantMessage to omit the pair rather than rendering "sourceSystem=undefined"', () => {
    expect(toTenantMessage({ fileId: 'f1', sourceSystem: sanitizeSourceSystem(42) })).toBe('fileId=f1')
    expect(toTenantMessage({ fileId: 'f1', sourceSystem: sanitizeSourceSystem('rps-portal') })).toBe('fileId=f1 sourceSystem=rps-portal')
  })
})
