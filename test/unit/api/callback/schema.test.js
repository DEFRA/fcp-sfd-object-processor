import { describe, test, expect } from 'vitest'
import { callbackPayloadSchema } from '../../../../src/api/callback/schema.js'

describe('callbackPayloadSchema validation', () => {
  const basePayload = {
    uploadStatus: 'ready',
    metadata: { example: 'value' },
    form: { field: 'value' },
    numberOfRejectedFiles: 0
  }

  test('valid payload passes validation', () => {
    const { error, value } = callbackPayloadSchema.validate(basePayload)
    expect(error).toBeUndefined()
    expect(value).toEqual(basePayload)
  })

  test('missing uploadStatus fails validation', () => {
    const { error } = callbackPayloadSchema.validate({
      ...basePayload,
      uploadStatus: null
    })
    expect(error).toBeDefined()
    expect(error.details[0].path).toContain('uploadStatus')
  })

  test('invalid uploadStatus type fails validation', () => {
    const { error } = callbackPayloadSchema.validate({
      ...basePayload,
      uploadStatus: 123
    })
    expect(error).toBeDefined()
    expect(error.details[0].path).toContain('uploadStatus')
  })

  test('missing metadata fails validation', () => {
    const { error } = callbackPayloadSchema.validate({
      ...basePayload,
      metadata: null
    })
    expect(error).toBeDefined()
    expect(error.details[0].path).toContain('metadata')
  })

  test('missing form fails validation', () => {
    const { error } = callbackPayloadSchema.validate({
      ...basePayload,
      form: null
    })
    expect(error).toBeDefined()
    expect(error.details[0].path).toContain('form')
  })

  test('negative numberOfRejectedFiles fails validation', () => {
    const { error } = callbackPayloadSchema.validate({
      ...basePayload,
      numberOfRejectedFiles: -1
    })
    expect(error).toBeDefined()
    expect(error.details[0].path).toContain('numberOfRejectedFiles')
  })

  test('non-integer numberOfRejectedFiles fails validation', () => {
    const { error } = callbackPayloadSchema.validate({
      ...basePayload,
      numberOfRejectedFiles: 3.14
    })
    expect(error).toBeDefined()
    expect(error.details[0].path).toContain('numberOfRejectedFiles')
  })

  test('extra top-level field fails validation', () => {
    const { error } = callbackPayloadSchema.validate({
      ...basePayload,
      extraField: 'not allowed'
    })
    expect(error).toBeDefined()
    expect(error.details[0].path).toEqual(['extraField'])
  })
})
