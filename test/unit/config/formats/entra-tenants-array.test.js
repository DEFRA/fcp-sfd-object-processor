import { describe, expect, test } from 'vitest'

import { entraTenantsArray } from '../../../../src/config/formats/entra-tenants-array.js'

const validUuid = '11111111-1111-1111-1111-111111111111'

describe('entraTenantsArray format', () => {
  test('validate accepts null and empty string', () => {
    expect(() => entraTenantsArray.validate(null)).not.toThrow()
    expect(() => entraTenantsArray.validate('')).not.toThrow()
  })

  test('validate throws for invalid JSON string', () => {
    expect(() => entraTenantsArray.validate('not-json')).toThrow('AUTH_ENTRA_TENANTS must be valid JSON')
  })

  test('validate throws when parsed value is not an array', () => {
    expect(() => entraTenantsArray.validate('{}')).toThrow('Must be an array of tenant configs')
  })

  test('validate throws when tenant entry is not an object', () => {
    expect(() => entraTenantsArray.validate('[null]')).toThrow('Each tenant must be an object with tenantId and allowedGroupIds')
  })

  test('validate throws for missing or empty tenantId', () => {
    const payload = JSON.stringify([{ tenantId: '', allowedGroupIds: [validUuid] }])
    expect(() => entraTenantsArray.validate(payload)).toThrow('tenantId must be a non-empty string')
  })

  test('validate throws for non-array or empty allowedGroupIds', () => {
    const payload1 = JSON.stringify([{ tenantId: 't1', allowedGroupIds: 'not-an-array' }])
    const payload2 = JSON.stringify([{ tenantId: 't1', allowedGroupIds: [] }])
    expect(() => entraTenantsArray.validate(payload1)).toThrow('allowedGroupIds must be a non-empty array of UUIDs')
    expect(() => entraTenantsArray.validate(payload2)).toThrow('allowedGroupIds must be a non-empty array of UUIDs')
  })

  test('validate throws for invalid UUIDs in allowedGroupIds', () => {
    const payload = JSON.stringify([{ tenantId: 't1', allowedGroupIds: ['not-a-uuid'] }])
    expect(() => entraTenantsArray.validate(payload)).toThrow('allowedGroupIds must contain only valid UUID strings')
  })

  test('validate accepts a correctly formed array (object or JSON string)', () => {
    const obj = [{ tenantId: 't1', allowedGroupIds: [validUuid] }]
    expect(() => entraTenantsArray.validate(obj)).not.toThrow()
    expect(() => entraTenantsArray.validate(JSON.stringify(obj))).not.toThrow()
  })

  test('coerce returns arrays, parses JSON strings, and converts null/empty to []', () => {
    const arr = [{ tenantId: 't1', allowedGroupIds: [validUuid] }]
    expect(entraTenantsArray.coerce(arr)).toBe(arr)
    expect(entraTenantsArray.coerce(JSON.stringify(arr))).toEqual(arr)
    expect(entraTenantsArray.coerce(null)).toEqual([])
    expect(entraTenantsArray.coerce('')).toEqual([])
    // other types are returned unchanged
    expect(entraTenantsArray.coerce(123)).toBe(123)
  })
})
