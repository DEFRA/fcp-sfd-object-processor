import { schemaConsts } from '../constants/schemas.js'

// CDP only indexes a fixed subset of ECS fields, so any additional context is
// carried in tenant.message rather than emitted as bespoke top-level keys.
// See cdp-documentation/how-to/logging.md for the allow-list.
const toTenantMessage = (context) => {
  const entries = Object.entries(context).filter(([, value]) => value !== null && value !== undefined)
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(' ') : null
}

// Several log sites read metadata.service before Joi has validated it, including the
// unauthenticated callback route. toTenantMessage does not escape values, so a free-text
// value such as "a sourceSystem=b" would forge a second pair. Only values on the same
// allow list as the payload schema are rendered; anything else is omitted.
const sanitizeSourceSystem = (value) =>
  schemaConsts.SERVICE_EXAMPLES.includes(value) ? value : undefined

export { toTenantMessage, sanitizeSourceSystem }
