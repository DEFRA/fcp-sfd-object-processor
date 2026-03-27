import { AUTH_STRATEGY_NAMES } from '../../constants/auth.js'
import { createAuthStrategy } from './create-auth-strategy.js'

/**
 * Builds Hapi JWT strategy options for Microsoft Entra ID (Azure AD) authentication.
 * Validates tokens against the tenant's JWKS endpoint and checks security group membership.
 */
export function getEntraAuthOptions (tenantConfig) {
  const tenantId = tenantConfig?.tenantId
  const allowedGroupIds = tenantConfig?.allowedGroupIds || []

  const jwksUri = tenantId ? `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys` : ''
  const issuers = tenantId
    ? [`https://sts.windows.net/${tenantId}/`, `https://login.microsoftonline.com/${tenantId}/v2.0`]
    : []
  const strategyName = tenantId ? `${AUTH_STRATEGY_NAMES.ENTRA}-${tenantId}` : AUTH_STRATEGY_NAMES.ENTRA

  return createAuthStrategy({
    strategyName,
    jwksUri,
    verify: {
      aud: false,
      sub: false,
      iss: issuers,
      nbf: true,
      exp: true
    },
    getAllowedList: () => allowedGroupIds,
    checkAllowed: (payload, allowedGroupIdsLocal) => {
      const tokenGroups = Array.isArray(payload.groups) ? payload.groups : []
      const allowedSet = new Set(allowedGroupIdsLocal)
      const allowed = tokenGroups.some(group => allowedSet.has(group))
      return { allowed, failureContext: { tokenGroups, requiredGroups: allowedGroupIdsLocal } }
    },
    emptyListMessage: 'No authorized security groups configured',
    unauthorisedMessage: 'Token does not belong to an authorized Security Group'
  })
}
