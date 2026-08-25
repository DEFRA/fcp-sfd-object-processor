import { AUTH_STRATEGY_NAMES } from '../../constants/auth.js'
import { createAuthStrategy } from './create-auth-strategy.js'

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
 * tenant's config. Used inside `validate()` to resolve which tenant a token belongs to from its
 * own `iss` claim, since a single Hapi JWT strategy is registered for all tenants (see
 * `src/plugins/auth/index.js` for why: registering one strategy per tenant does not provide
 * fallback between tenants the way it might appear to).
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
 * Builds a single Hapi JWT strategy options object that accepts tokens from every configured
 * Entra tenant. Verifies tokens against each tenant's JWKS endpoint and checks security group
 * membership against that specific token's own tenant, resolved from its `iss` claim.
 * @param {object[]} [tenants] - Array of `{ tenantId, allowedGroupIds }`, one entry per tenant
 */
export function getEntraAuthOptions (tenants = []) {
  const issuerToTenant = buildIssuerToTenantMap(tenants)
  const jwksUris = tenants.map(({ tenantId }) => `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)

  return createAuthStrategy({
    strategyName: AUTH_STRATEGY_NAMES.ENTRA,
    jwksUris,
    verify: {
      aud: false,
      sub: false,
      iss: [...issuerToTenant.keys()],
      nbf: true,
      exp: true
    },
    // Resolves the allowed security groups for the specific tenant this token was issued by,
    // rather than a single fixed list. `@hapi/jwt` has already rejected any token whose `iss` is
    // not one of the keys in `issuerToTenant` (via `verify.iss` above) before this runs, so the
    // lookup cannot miss in practice — the `?? []` is defence in depth, not a reachable path.
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
  })
}
