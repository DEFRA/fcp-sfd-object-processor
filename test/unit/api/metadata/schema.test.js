import { describe, test, expect } from 'vitest'

import { metadataParamSchema } from '../../../../src/api/v1/metadata/schema.js'

const errorMessage = 'Invalid SBI format'

describe('Schema validation for /metadata', () => {
  test('accepts a valid 9-digit string', () => {
    const { error, value } = metadataParamSchema.validate({ sbi: '123456789' })
    expect(error).toBeUndefined()
    expect(value.sbi).toBe('123456789')
  })

  test('accepts a valid 9-digit string with leading zeros', () => {
    const { error, value } = metadataParamSchema.validate({ sbi: '000123456' })
    expect(error).toBeUndefined()
    expect(value.sbi).toBe('000123456')
  })

  test('rejects a string with letters', () => {
    const { error } = metadataParamSchema.validate({ sbi: '12345abcd' })
    expect(error).toBeDefined()
    expect(error.details[0].message).toBe(errorMessage)
  })

  test('rejects a string shorter than 9 digits', () => {
    const { error } = metadataParamSchema.validate({ sbi: '12345678' })
    expect(error).toBeDefined()
    expect(error.details[0].message).toBe(errorMessage)
  })

  test('rejects a string longer than 9 digits', () => {
    const { error } = metadataParamSchema.validate({ sbi: '1234567890' })
    expect(error).toBeDefined()
    expect(error.details[0].message).toBe(errorMessage)
  })

  test('rejects an empty string', () => {
    const { error } = metadataParamSchema.validate({ sbi: '' })
    expect(error).toBeDefined()
    expect(error.details[0].message).toBe(errorMessage)
  })

  test('rejects missing sbi', () => {
    const { error } = metadataParamSchema.validate({})
    expect(error).toBeDefined()
    expect(error.details[0].message).toBe(errorMessage)
  })
})
