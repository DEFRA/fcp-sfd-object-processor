import { describe, test, expect } from 'vitest'
import { flattenFormValues } from '../../../src/utils/flatten-form-files.js'

describe('flattenFormValues', () => {
  test('returns empty array for null', () => {
    expect(flattenFormValues(null)).toEqual([])
  })

  test('returns empty array for undefined', () => {
    expect(flattenFormValues(undefined)).toEqual([])
  })

  test('returns empty array for non-object', () => {
    expect(flattenFormValues('string')).toEqual([])
  })

  test('returns empty array for empty form', () => {
    expect(flattenFormValues({})).toEqual([])
  })

  test('returns single file object as flat array', () => {
    const file = { fileId: 'abc-123' }
    expect(flattenFormValues({ docs: file })).toEqual([file])
  })

  test('returns text fields as-is in flat array', () => {
    expect(flattenFormValues({ label: 'hello' })).toEqual(['hello'])
  })

  test('flattens array values in-place', () => {
    const f1 = { fileId: 'f1' }
    const f2 = { fileId: 'f2' }
    expect(flattenFormValues({ documents: [f1, f2] })).toEqual([f1, f2])
  })

  test('interleaves single and array values in insertion order', () => {
    const f1 = { fileId: 'f1' }
    const f2 = { fileId: 'f2' }
    const f3 = { fileId: 'f3' }
    const result = flattenFormValues({ single: f1, group: [f2, f3] })
    expect(result).toEqual([f1, f2, f3])
  })

  test('handles empty array values without contributing entries', () => {
    const file = { fileId: 'f1' }
    const result = flattenFormValues({ file, empty: [] })
    expect(result).toEqual([file])
  })

  test('preserves null and non-object items within arrays', () => {
    const file = { fileId: 'f1' }
    const result = flattenFormValues({ docs: [null, file, 'string', 42] })
    expect(result).toEqual([null, file, 'string', 42])
  })
})
