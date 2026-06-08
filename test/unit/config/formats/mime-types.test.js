import { describe, it, expect } from 'vitest'
import { mimeTypeArray } from '../../../../src/config/formats/mime-types.js'

describe('mimeTypeArray format', () => {
  it('validate allows null and empty string', () => {
    expect(() => mimeTypeArray.validate(null)).not.toThrow()
    expect(() => mimeTypeArray.validate('')).not.toThrow()
  })

  it('validate allows empty array', () => {
    expect(() => mimeTypeArray.validate([])).not.toThrow()
  })

  it('validate accepts comma separated string and arrays of valid types', () => {
    expect(() => mimeTypeArray.validate('application/pdf,text/plain')).not.toThrow()
    expect(() => mimeTypeArray.validate(['application/pdf', 'text/plain'])).not.toThrow()
  })

  it('validate throws for invalid mime types', () => {
    expect(() => mimeTypeArray.validate('not-a-mime')).toThrow(Error)
    expect(() => mimeTypeArray.validate([123])).toThrow(Error)
  })

  it('coerce returns expected values', () => {
    expect(mimeTypeArray.coerce(null)).toEqual([])
    expect(mimeTypeArray.coerce('')).toEqual([])
    expect(mimeTypeArray.coerce(['a', 'b'])).toEqual(['a', 'b'])
    expect(mimeTypeArray.coerce('a,b')).toEqual(['a', 'b'])
  })
})
