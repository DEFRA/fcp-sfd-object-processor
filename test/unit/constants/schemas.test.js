import { describe, test, expect } from 'vitest'

import { schemaConsts } from '../../../src/constants/schemas.js'

// These literals are the ranges published in docs/asyncapi/v1.yaml, the event
// contract CRM and FDM validate against. They are asserted as literals rather
// than read from the constants so that a change to the constants alone cannot
// silently drift away from the contract.
describe('schemaConsts business identifier ranges', () => {
  test('sbi range matches the published event contract', () => {
    expect(schemaConsts.SBI_MIN).toBe(105000000)
    expect(schemaConsts.SBI_MAX).toBe(999999999)
  })

  test('crn range matches the published event contract', () => {
    expect(schemaConsts.CRN_MIN).toBe(1050000000)
    expect(schemaConsts.CRN_MAX).toBe(9999999999)
  })

  test('sbi and crn examples fall within their ranges', () => {
    expect(schemaConsts.SBI_EXAMPLE).toBeGreaterThanOrEqual(schemaConsts.SBI_MIN)
    expect(schemaConsts.SBI_EXAMPLE).toBeLessThanOrEqual(schemaConsts.SBI_MAX)
    expect(schemaConsts.CRN_EXAMPLE).toBeGreaterThanOrEqual(schemaConsts.CRN_MIN)
    expect(schemaConsts.CRN_EXAMPLE).toBeLessThanOrEqual(schemaConsts.CRN_MAX)
  })
})
