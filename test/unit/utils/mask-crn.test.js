import { describe, expect, test } from 'vitest'

import { maskCrn, maskCrnInText } from '../../../src/utils/mask-crn.js'

describe('maskCrn', () => {
  test('masks all but the last four characters', () => {
    expect(maskCrn('1050000001')).toBe('******0001')
  })

  test('masks numeric CRNs', () => {
    expect(maskCrn(1050000001)).toBe('******0001')
  })

  test('keeps values of four characters or fewer unchanged', () => {
    expect(maskCrn('1234')).toBe('1234')
    expect(maskCrn('12')).toBe('12')
  })
})

describe('maskCrnInText', () => {
  test('masks CRNs embedded in log text', () => {
    expect(maskCrnInText('Invalid CRN 1050000001', '1050000001'))
      .toBe('Invalid CRN ******0001')
  })

  test('leaves text unchanged when no CRN is supplied', () => {
    expect(maskCrnInText('Publish failed', undefined)).toBe('Publish failed')
  })

  test('preserves undefined text', () => {
    expect(maskCrnInText(undefined, '1050000001')).toBeUndefined()
  })
})
