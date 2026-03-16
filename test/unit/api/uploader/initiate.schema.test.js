import { describe, test, expect } from 'vitest'
import { initiatePayloadSchema } from '../../../../src/api/v1/uploader/initiate/schema.js'

const mockValidPayload = {
  redirect: '/upload-complete',
  metadata: {
    sbi: 105000000,
    crn: 1050000000,
    frn: 1102658375,
    submissionId: '1733826312',
    type: 'CS_Agreement_Evidence',
    reference: 'user entered reference',
    service: 'fcp-sfd-frontend',
    uosr: '105000000_1733826312'
  }
}

describe('initiatePayloadSchema validation', () => {
  describe('valid payloads', () => {
    test('valid complete payload passes validation', () => {
      const { error } = initiatePayloadSchema.validate(mockValidPayload)
      expect(error).toBeUndefined()
    })

    test('valid payload with rps-portal service passes validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, service: 'rps-portal' }
      })
      expect(error).toBeUndefined()
    })
  })

  describe('redirect validation', () => {
    test('missing redirect fails validation', () => {
      const { redirect, ...payload } = mockValidPayload
      const { error } = initiatePayloadSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['redirect'])
      expect(error.details[0].type).toBe('any.required')
    })

    test('valid relative redirect URL passes validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        redirect: '/some/path/to/success'
      })
      expect(error).toBeUndefined()
    })

    test('absolute redirect URL fails validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        redirect: 'https://example.com/upload-complete'
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['redirect'])
      expect(error.details[0].type).toBe('string.pattern.base')
    })

    test('redirect not starting with / fails validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        redirect: 'not-starting-with-slash'
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['redirect'])
      expect(error.details[0].type).toBe('string.pattern.base')
    })
  })

  describe('metadata validation', () => {
    test('missing metadata fails validation', () => {
      const { metadata, ...payload } = mockValidPayload
      const { error } = initiatePayloadSchema.validate(payload)
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata'])
    })

    test('missing sbi fails validation', () => {
      const { sbi, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'sbi'])
    })

    test('missing crn fails validation', () => {
      const { crn, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'crn'])
    })

    test('missing frn fails validation', () => {
      const { frn, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'frn'])
    })

    test('missing submissionId fails validation', () => {
      const { submissionId, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'submissionId'])
    })

    test('missing type fails validation', () => {
      const { type, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'type'])
    })

    test('any string value for type passes validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, type: 'SomeNewType' }
      })
      expect(error).toBeUndefined()
    })

    test('missing reference fails validation', () => {
      const { reference, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'reference'])
    })

    test('missing service fails validation', () => {
      const { service, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'service'])
    })

    test('missing uosr fails validation', () => {
      const { uosr, ...metadata } = mockValidPayload.metadata
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'uosr'])
    })

    test('invalid sbi format fails validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, sbi: 123 }
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'sbi'])
    })

    test('invalid crn format fails validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, crn: 123 }
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'crn'])
    })

    test('invalid service value fails validation', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, service: 'invalid-service' }
      })
      expect(error).toBeDefined()
      expect(error.details[0].path).toEqual(['metadata', 'service'])
      expect(error.details[0].type).toBe('any.only')
    })
  })

  describe('strict mode', () => {
    test('unknown top-level fields are rejected', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        unknownField: 'should-fail'
      })
      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('object.unknown')
    })

    test('unknown metadata fields are rejected', () => {
      const { error } = initiatePayloadSchema.validate({
        ...mockValidPayload,
        metadata: { ...mockValidPayload.metadata, extraField: 'should-fail' }
      })
      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('object.unknown')
    })
  })
})
