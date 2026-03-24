import { AUTH_STRATEGY_NAMES } from '../../constants/auth.js'
import { createAuthStrategy } from './create-auth-strategy.js'

/**
 * Builds Hapi JWT strategy options for Microsoft Entra ID (Azure AD) authentication.
 * Validates tokens against the tenant's JWKS endpoint and checks security group membership.
 */
export function getEntraAuthOptions (tenantConfig) {
  const { tenantId, allowedGroupIds } = tenantConfig || {}

  return createAuthStrategy({
    strategyName: `${AUTH_STRATEGY_NAMES.ENTRA}-${tenantId}`,
    jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
    verify: {
      aud: false,
      sub: false,
      iss: [`https://sts.windows.net/${tenantId}/`, `https://login.microsoftonline.com/${tenantId}/v2.0`], // Accept both v1.0 and v2.0 tokens
      nbf: true,
      exp: true
    },
    getAllowedList: () => allowedGroupIds || [],
    checkAllowed: (payload, allowedGroupIdsLocal) => {
      const tokenGroups = Array.isArray(payload.groups) ? payload.groups : []
      const allowed = tokenGroups.some(group => allowedGroupIdsLocal.includes(group))
      return { allowed, failureContext: { tokenGroups, requiredGroups: allowedGroupIdsLocal } }
    },
    emptyListMessage: 'No authorized security groups configured',
    unauthorisedMessage: 'Token does not belong to an authorized Security Group'
  })
}
