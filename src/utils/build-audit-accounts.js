import { schemaConsts } from '../constants/schemas.js'

/**
 * Validates a CRN (Company Registration Number) value.
 *
 * Returns `true` if the CRN is a valid integer number or a string of digits within the defined range, otherwise returns `false`.
 *
 * @param {string|number|null|undefined} crn
 * @returns {boolean}
 */
const isValidCrn = (crn) => {
  const isIntegerNumber = typeof crn === 'number' && Number.isInteger(crn)
  const isDigitsString = typeof crn === 'string' && /^\d+$/.test(crn)

  if (!isIntegerNumber && !isDigitsString) {
    return false
  }

  const numericCrn = Number(crn)
  return numericCrn >= schemaConsts.CRN_MIN && numericCrn <= schemaConsts.CRN_MAX
}

/**
 * Builds the optional `accounts` fragment of an audit event.
 *
 * Returns an empty object when neither account identifier is valid, so the
 * result can always be spread into an audit payload without empty attribution.
 *
 * @param {{ sbi?: number|string|null, crn?: number|string|null }} [identifiers]
 * @returns {{ accounts?: { sbi?: string, crn?: string } }} audit accounts fragment
 */
export const buildAuditAccounts = ({ sbi, crn } = {}) => {
  const accounts = {}

  if (sbi !== undefined && sbi !== null && sbi !== '') {
    accounts.sbi = String(sbi)
  }

  if (isValidCrn(crn)) {
    accounts.crn = String(Number(crn))
  }

  return Object.keys(accounts).length > 0 ? { accounts } : {}
}
