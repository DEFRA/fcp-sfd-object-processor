import { describe, test, expect } from 'vitest'
import { initiatePayloadSchema } from '../../../../src/api/initiate/schema.js'

describe('initiatePayloadSchema', () => {
  test('accepts a valid payload', () => {
    const payload = {
      redirect: '/redirect',
      s3Bucket: 'my-bucket',
      s3Path: 'scanned',
      callback: 'https://example.com/callback',
      metadata: { filename: 'test.pdf' },
      mimeTypes: ['image/png', 'application/pdf'],
      maxFileSize: 1024
    }

    const { error, value } = initiatePayloadSchema.validate(payload)

    expect(error).toBeUndefined()
    expect(value).toStrictEqual(payload)
  })

  test('requires redirect and s3Bucket', () => {
    const { error } = initiatePayloadSchema.validate({}, { abortEarly: false })
    const errorDetailsArray = error.details.map(d => d.path.join('.'))

    expect(error).toBeDefined()
    expect(errorDetailsArray).toContain('redirect')
    expect(errorDetailsArray).toContain('s3Bucket')
  })

  test('rejects invalid callback URL', () => {
    const payload = {
      redirect: 'https://example.com',
      s3Bucket: 'my-bucket',
      callback: 'not-a-url'
    }

    const { error } = initiatePayloadSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.details[0].path).toContain('callback')
  })

  test('defaults metadata to empty object if not provided', () => {
    const payload = {
      redirect: 'https://example.com',
      s3Bucket: 'my-bucket'
    }

    const { error, value } = initiatePayloadSchema.validate(payload)

    expect(error).toBeUndefined()
    expect(value.metadata).toEqual({})
  })

  test('rejects negative maxFileSize', () => {
    const payload = {
      redirect: 'https://example.com',
      s3Bucket: 'my-bucket',
      maxFileSize: -10
    }

    const { error } = initiatePayloadSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.details[0].path).toContain('maxFileSize')
  })
})
