import { describe, test, expect, vi } from 'vitest'

const { mockConfigGet } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    if (key === 'cdpUploaderMimeTypes') return ['application/pdf', 'image/jpeg', 'image/png']
    if (key === 'cdpUploaderDocumentTypes') return ['CS_Agreement_Evidence', 'CS_Application_Evidence']
    return null
  })
}))

vi.mock('../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

const { baseMetadataSchema } = await import('../../../../../src/api/v1/schemas/uploader-common.js')

const validMetadata = {
  sbi: 105000000,
  crn: 1050000000,
  frn: 1102658375,
  submissionId: '1733826312',
  type: 'CS_Agreement_Evidence',
  reference: 'user entered reference',
  service: 'fcp-sfd-frontend',
  uosr: '105000000_1733826312'
}

describe('baseMetadataSchema — type field', () => {
  test('accepts CS_Agreement_Evidence', () => {
    const { error } = baseMetadataSchema.validate(validMetadata)
    expect(error).toBeUndefined()
  })

  test('rejects an invalid type value', () => {
    const { error } = baseMetadataSchema.validate({ ...validMetadata, type: 'INVALID_TYPE' })
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('any.only')
    expect(error.message).toContain('type must be one of:')
    expect(error.message).toContain('CS_Agreement_Evidence')
  })

  test('rejects an empty type string', () => {
    const { error } = baseMetadataSchema.validate({ ...validMetadata, type: '' })
    expect(error).toBeDefined()
  })

  test('rejects when type is missing', () => {
    const { type, ...rest } = validMetadata
    const { error } = baseMetadataSchema.validate(rest)
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('any.required')
    expect(error.message).toContain('type is required')
  })

  test('rejects null type', () => {
    const { error } = baseMetadataSchema.validate({ ...validMetadata, type: null })
    expect(error).toBeDefined()
  })
})
