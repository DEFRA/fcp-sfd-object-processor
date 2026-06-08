import { describe, it, expect } from 'vitest'
import { endpointPath } from '../../../../src/config/formats/endpoint-path.js'

describe('endpointPath format', () => {
  it('accepts strings starting with /', () => {
    expect(() => endpointPath.validate('/foo')).not.toThrow()
  })

  it('throws TypeError for non-strings', () => {
    expect(() => endpointPath.validate(123)).toThrow(TypeError)
  })

  it('throws for strings not starting with slash', () => {
    expect(() => endpointPath.validate('foo')).toThrow(Error)
  })
})
