export const buildAuditAccounts = (sbi) => {
  if (sbi === undefined || sbi === null) {
    return {}
  }

  return { accounts: { sbi: String(sbi) } }
}
