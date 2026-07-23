import { describe, test, expect } from 'vitest'

import { normaliseFormFields } from '../../../src/utils/normalise-form-fields.js'

describe('normaliseFormFields', () => {
  test('returns original input for null', () => {
    expect(normaliseFormFields(null)).toBeNull()
  })

  test('returns original input for undefined', () => {
    expect(normaliseFormFields(undefined)).toBeUndefined()
  })

  test('returns original input for non-object values', () => {
    expect(normaliseFormFields('string')).toBe('string')
  })

  test('keeps single-value fields unchanged', () => {
    const file = { fileId: 'f1' }

    expect(normaliseFormFields({ document: file })).toEqual({ document: file })
  })

  test('re-keys grouped array fields with 1-based indexes', () => {
    const f1 = { fileId: 'f1' }
    const f2 = { fileId: 'f2' }

    expect(normaliseFormFields({ document: [f1, f2] })).toEqual({
      'document-1': f1,
      'document-2': f2
    })
  })

  test('supports mixed scalar and grouped fields', () => {
    const f1 = { fileId: 'f1' }
    const f2 = { fileId: 'f2' }

    expect(normaliseFormFields({
      single: f1,
      grouped: [f2],
      text: 'hello'
    })).toEqual({
      single: f1,
      'grouped-1': f2,
      text: 'hello'
    })
  })
})
