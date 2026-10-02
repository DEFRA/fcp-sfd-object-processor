import { describe, it, expect } from 'vitest'
import { positiveInt } from '../../../../src/config/formats/positive-int.js'

describe('positiveInt format', () => {
  it('accepts 1', () => {
    expect(() => positiveInt.validate(1)).not.toThrow()
  })

  it('accepts an integer above 1', () => {
    expect(() => positiveInt.validate(100)).not.toThrow()
  })

  it('rejects zero', () => {
    expect(() => positiveInt.validate(0)).toThrow('must be a positive integer')
  })

  it('rejects a negative value', () => {
    expect(() => positiveInt.validate(-1)).toThrow('must be a positive integer')
  })

  it('rejects a non-integer number', () => {
    expect(() => positiveInt.validate(1.5)).toThrow('must be a positive integer')
  })

  it('coerces a numeric string to an integer', () => {
    expect(positiveInt.coerce('50')).toBe(50)
  })

  it('leaves a non-numeric string to fail validation', () => {
    expect(() => positiveInt.validate(positiveInt.coerce('invalid'))).toThrow('must be a positive integer')
  })
})
