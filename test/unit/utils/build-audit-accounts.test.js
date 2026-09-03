import { describe, expect, test } from 'vitest'

import { buildAuditAccounts } from '../../../src/utils/build-audit-accounts.js'

describe('buildAuditAccounts', () => {
  test.each([
    [undefined, {}],
    [null, {}],
    [105000000, { accounts: { sbi: '105000000' } }]
  ])('builds accounts for sbi %p', (sbi, expected) => {
    expect(buildAuditAccounts(sbi)).toEqual(expected)
  })
})
