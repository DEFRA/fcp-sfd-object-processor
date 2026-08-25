import { AUTH_PROVIDER_NAMES } from '../../constants/auth.js'

/**
 * Builds the two accepted issuer strings (v1.0 and v2.0 token forms) for a given Entra tenant.
 * @param {string} tenantId - Entra tenant GUID
 */
const buildTenantIssuers = (tenantId) => [
  `https://sts.windows.net/${tenantId}/`,
  `https://login.microsoftonline.com/${tenantId}/v2.0`
]

/**
 * Builds a lookup from every accepted issuer string, for every configured tenant, back to that
 * tenant's config. Used to resolve which tenant a token belongs to from its own `iss` claim, since
 * all tenants share a single provider entry rather than one strategy each.
 * @param {object[]} tenants - Array of `{ tenantId, allowedGroupIds }`
 */
const buildIssuerToTenantMap = (tenants) => {
  const map = new Map()
  for (const tenantConfig of tenants) {
    for (const issuer of buildTenantIssuers(tenantConfig.tenantId)) {
      map.set(issuer, tenantConfig)
    }
  }
  return map
}

/**
 * Builds the Entra provider descriptor consumed by `createAuthStrategy`. Accepts tokens from every
 * configured tenant, and checks security group membership against that specific token's own tenant,
 * resolved from its `iss` claim.
 * @param {object[]} [tenants] - Array of `{ tenantId, allowedGroupIds }`, one entry per tenant
 * @returns {import('./create-auth-strategy.js').AuthProvider}
 */
export function getEntraAuthProvider (tenants = []) {
  const issuerToTenant = buildIssuerToTenantMap(tenants)

  return {
    name: AUTH_PROVIDER_NAMES.ENTRA,
    jwksUris: tenants.map(({ tenantId }) => `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    issuers: [...issuerToTenant.keys()],
    // Resolves the allowed security groups for the specific tenant this token was issued by,
    // rather than a single fixed list. `@hapi/jwt` has already rejected any token whose `iss` is
    // not one of the keys in `issuerToTenant` (via the strategy's `verify.iss`) before this runs,
    // so the lookup cannot miss in practice — the `?? []` is defence in depth.
    getAllowedList: (payload) => issuerToTenant.get(payload.iss)?.allowedGroupIds ?? [],
    checkAllowed: (payload, allowedGroupIdsLocal) => {
      const tokenGroups = Array.isArray(payload.groups) ? payload.groups : []
      const allowedSet = new Set(allowedGroupIdsLocal)
      const allowed = tokenGroups.some(group => allowedSet.has(group))
      return {
        allowed,
        failureContext: {
          tokenGroups,
          requiredGroups: allowedGroupIdsLocal,
          issuer: payload.iss,
          tenantId: issuerToTenant.get(payload.iss)?.tenantId
        }
      }
    },
    emptyListMessage: 'No authorized security groups configured',
    unauthorisedMessage: 'Token does not belong to an authorized Security Group'
  }
}
