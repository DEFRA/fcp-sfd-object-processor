import { describe, it, expect } from 'vitest'
import { documentTypeArray } from '../../../../src/config/formats/document-types.js'

describe('documentTypeArray format', () => {
  it('validate throws for null', () => {
    expect(() => documentTypeArray.validate(null)).toThrow(Error)
  })

  it('validate throws for empty string', () => {
    expect(() => documentTypeArray.validate('')).toThrow(Error)
  })

  it('validate throws for empty array', () => {
    expect(() => documentTypeArray.validate([])).toThrow(Error)
  })

  it('validate accepts comma separated string of valid types', () => {
    expect(() => documentTypeArray.validate('CS_Agreement_Evidence,CS_Application_Evidence')).not.toThrow()
  })

  it('validate accepts an array of valid type strings', () => {
    expect(() => documentTypeArray.validate(['CS_Agreement_Evidence', 'GS_SIG_Claim_Evidence'])).not.toThrow()
  })

  it('validate throws for an entry that is not a string', () => {
    expect(() => documentTypeArray.validate([123])).toThrow(Error)
  })

  it('validate throws for an empty string entry', () => {
    expect(() => documentTypeArray.validate([''])).toThrow(Error)
  })

  it('coerce returns empty array for null and empty string', () => {
    expect(documentTypeArray.coerce(null)).toEqual([])
    expect(documentTypeArray.coerce('')).toEqual([])
  })

  it('coerce returns array as-is', () => {
    expect(documentTypeArray.coerce(['CS_Agreement_Evidence'])).toEqual(['CS_Agreement_Evidence'])
  })

  it('coerce splits comma separated string into array', () => {
    expect(documentTypeArray.coerce('CS_Agreement_Evidence,CS_Application_Evidence')).toEqual([
      'CS_Agreement_Evidence',
      'CS_Application_Evidence'
    ])
  })

  it('coerce trims whitespace from entries', () => {
    expect(documentTypeArray.coerce('CS_Agreement_Evidence, CS_Application_Evidence')).toEqual([
      'CS_Agreement_Evidence',
      'CS_Application_Evidence'
    ])
  })

  it('coerce trims whitespace from array entries', () => {
    expect(documentTypeArray.coerce([' CS_Agreement_Evidence', 'GS_SIG_Claim_Evidence '])).toEqual([
      'CS_Agreement_Evidence',
      'GS_SIG_Claim_Evidence'
    ])
  })

  it('coerce leaves non-string array entries untouched', () => {
    expect(documentTypeArray.coerce([123])).toEqual([123])
  })
})
