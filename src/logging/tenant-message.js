// CDP only indexes a fixed subset of ECS fields, so any additional context is
// carried in tenant.message rather than emitted as bespoke top-level keys.
// See cdp-documentation/how-to/logging.md for the allow-list.
const toTenantMessage = (context) => {
  const entries = Object.entries(context).filter(([, value]) => value !== null && value !== undefined)
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(' ') : null
}

// A source system that is missing or not a string must be omitted from tenant.message
// rather than rendered as "sourceSystem=undefined", so every extraction point sanitises
// the raw payload value through here before it reaches toTenantMessage.
const sanitizeSourceSystem = (value) => (typeof value === 'string' ? value : undefined)

export { toTenantMessage, sanitizeSourceSystem }
