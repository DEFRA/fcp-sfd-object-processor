import { describe, expect, test } from 'vitest'

import { schemaConsts } from '../../../src/constants/schemas.js'
import { buildAuditAccounts } from '../../../src/utils/build-audit-accounts.js'

describe('buildAuditAccounts', () => {
  test.each([
    [undefined, {}],
    [{ sbi: null }, {}],
    [{ sbi: '' }, {}],
    [{ sbi: 105000000 }, { accounts: { sbi: '105000000' } }],
    [{ crn: schemaConsts.CRN_MIN }, { accounts: { crn: String(schemaConsts.CRN_MIN) } }],
    [{ crn: `0${schemaConsts.CRN_MIN}` }, { accounts: { crn: String(schemaConsts.CRN_MIN) } }],
    [{ crn: String(schemaConsts.CRN_MAX) }, { accounts: { crn: String(schemaConsts.CRN_MAX) } }],
    [{ sbi: 105000000, crn: schemaConsts.CRN_MIN }, { accounts: { sbi: '105000000', crn: String(schemaConsts.CRN_MIN) } }],
    [{ crn: schemaConsts.CRN_MIN - 1 }, {}],
    [{ crn: schemaConsts.CRN_MAX + 1 }, {}],
    [{ crn: 'abc' }, {}],
    [{ crn: '1'.repeat(51) }, {}],
    [{ crn: 1.5 }, {}],
    [{ crn: null }, {}],
    [{ crn: '' }, {}],
    [{ crn: '0x3E95BA80' }, {}],
    [{ crn: '1.1e9' }, {}],
    [{ crn: ' 1100000000 ' }, {}],
    [{ crn: Number.NaN }, {}],
    [{ crn: Number.POSITIVE_INFINITY }, {}],
    [{ sbi: 105000000, crn: 'abc' }, { accounts: { sbi: '105000000' } }]
  ])('builds audit accounts for %p', (identifiers, expected) => {
    expect(buildAuditAccounts(identifiers)).toEqual(expected)
  })
})
