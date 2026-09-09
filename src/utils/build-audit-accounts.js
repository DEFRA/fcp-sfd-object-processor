/**
 * Builds the optional `accounts` fragment of an audit event.
 *
 * Returns an empty object when the SBI is unknown, so the result can always be
 * spread into an audit payload without emitting an empty attribution.
 *
 * @param {number|string|null|undefined} sbi Single Business Identifier, if known
 * @returns {{ accounts?: { sbi: string } }} audit accounts fragment
 */
export const buildAuditAccounts = (sbi) => {
  if (sbi === undefined || sbi === null || sbi === '') {
    return {}
  }

  return { accounts: { sbi: String(sbi) } }
}
