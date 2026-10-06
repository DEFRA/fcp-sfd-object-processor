import { describe, test, expect } from 'vitest'
import { constants as httpConstants } from 'node:http2'

import { metadataParamSchema, metadataQuerySchema, metadataResponseSchema } from '../../../../src/api/v1/metadata/schemas/index.js'
import { mockMetadataResponse } from '../../../mocks/metadata.js'
import { config } from '../../../../src/config/index.js'

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

describe('Query schema validation for /metadata', () => {
  const defaultPageSize = config.get('mongo.metadataSbiPageSize')
  const maxPageSize = config.get('mongo.metadataSbiMaxPageSize')
  const validCursor = '66f9c1e2a3b4c5d6e7f80912'

  test('applies the configured default page size when pageSize is absent', () => {
    const { error, value } = metadataQuerySchema.validate({})
    expect(error).toBeUndefined()
    expect(value.pageSize).toBe(defaultPageSize)
  })

  test('leaves after undefined when it is absent', () => {
    const { error, value } = metadataQuerySchema.validate({})
    expect(error).toBeUndefined()
    expect(value.after).toBeUndefined()
  })

  test('accepts a page size of 1', () => {
    const { error, value } = metadataQuerySchema.validate({ pageSize: '1' })
    expect(error).toBeUndefined()
    expect(value.pageSize).toBe(1)
  })

  test('accepts a page size equal to the configured maximum', () => {
    const { error, value } = metadataQuerySchema.validate({ pageSize: String(maxPageSize) })
    expect(error).toBeUndefined()
    expect(value.pageSize).toBe(maxPageSize)
  })

  test('rejects a page size above the configured maximum', () => {
    const { error } = metadataQuerySchema.validate({ pageSize: String(maxPageSize + 1) })
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('number.max')
  })

  test('rejects a page size of 0', () => {
    const { error } = metadataQuerySchema.validate({ pageSize: '0' })
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('number.min')
  })

  test('rejects a non numeric page size', () => {
    const { error } = metadataQuerySchema.validate({ pageSize: 'ten' })
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('number.base')
  })

  test('rejects a fractional page size', () => {
    const { error } = metadataQuerySchema.validate({ pageSize: '1.5' })
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('number.integer')
  })

  test('accepts a 24 character hex cursor', () => {
    const { error, value } = metadataQuerySchema.validate({ after: validCursor })
    expect(error).toBeUndefined()
    expect(value.after).toBe(validCursor)
  })

  test('rejects a cursor containing non hex characters', () => {
    const { error } = metadataQuerySchema.validate({ after: 'zzf9c1e2a3b4c5d6e7f80912' })
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('string.hex')
  })

  test('rejects a 23 character cursor', () => {
    const { error } = metadataQuerySchema.validate({ after: validCursor.slice(0, 23) })
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('string.length')
  })

  test('rejects a 25 character cursor', () => {
    const { error } = metadataQuerySchema.validate({ after: `${validCursor}0` })
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('string.length')
  })

  test('rejects an empty cursor', () => {
    const { error } = metadataQuerySchema.validate({ after: '' })
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('string.empty')
  })

  test('rejects an unknown query parameter', () => {
    const { error } = metadataQuerySchema.validate({ page: '2' })
    expect(error).toBeDefined()
    expect(error.details[0].type).toBe('object.unknown')
  })
})

describe('Response envelope schema for /metadata', () => {
  const successSchema = metadataResponseSchema[httpConstants.HTTP_STATUS_OK]
  const cursor = '66f9c1e2a3b4c5d6e7f80912'

  const buildData = () => mockMetadataResponse.map(({ metadata, file }) => ({ _id: cursor, metadata, file }))

  const buildPage = (overrides = {}) => ({
    pageSize: 100,
    count: 2,
    hasMore: false,
    nextCursor: null,
    ...overrides
  })

  test('accepts a final page with a null next cursor', () => {
    const { error } = successSchema.validate({ data: buildData(), page: buildPage() })
    expect(error).toBeUndefined()
  })

  test('accepts a page with more records and a hex next cursor', () => {
    const { error } = successSchema.validate({ data: buildData(), page: buildPage({ hasMore: true, nextCursor: cursor }) })
    expect(error).toBeUndefined()
  })

  test('accepts an empty page', () => {
    const { error } = successSchema.validate({ data: [], page: buildPage({ count: 0 }) })
    expect(error).toBeUndefined()
  })

  test('rejects a response without the page object', () => {
    const { error } = successSchema.validate({ data: buildData() })
    expect(error).toBeDefined()
    expect(error.details[0].path).toEqual(['page'])
  })

  test.each(['pageSize', 'count', 'hasMore', 'nextCursor'])('rejects a page without %s', (field) => {
    const page = buildPage()
    delete page[field]

    const { error } = successSchema.validate({ data: buildData(), page })
    expect(error).toBeDefined()
    expect(error.details[0].path).toEqual(['page', field])
  })

  test('rejects a next cursor that is not a 24 character hex string', () => {
    const { error } = successSchema.validate({ data: buildData(), page: buildPage({ hasMore: true, nextCursor: 'not-a-cursor' }) })
    expect(error).toBeDefined()
    expect(error.details[0].path).toEqual(['page', 'nextCursor'])
  })

  test('rejects messaging on a returned record', () => {
    const [first] = buildData()
    const { error } = successSchema.validate({
      data: [{ ...first, messaging: { correlationId: 'id' } }],
      page: buildPage({ count: 1 })
    })
    expect(error).toBeDefined()
    expect(error.details[0].path).toEqual(['data', 0, 'messaging'])
  })
})
