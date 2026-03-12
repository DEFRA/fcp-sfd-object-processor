import { config } from '../../config/index.js'
import { AUTH_STRATEGY_NAMES } from '../../constants/auth.js'
import { createAuthStrategy } from './create-auth-strategy.js'

/**
 * Builds Hapi JWT strategy options for Microsoft Entra ID (Azure AD) authentication.
 * Validates tokens against the tenant's JWKS endpoint and checks security group membership.
 */
export function getEntraAuthOptions () {
  const tenant = config.get('auth.entra.tenant')

  return createAuthStrategy({
    strategyName: AUTH_STRATEGY_NAMES.ENTRA,
    jwksUri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
    verify: {
      aud: false,
      sub: false,
      iss: [`https://sts.windows.net/${tenant}/`, `https://login.microsoftonline.com/${tenant}/v2.0`], // Accept both v1.0 and v2.0 tokens
      nbf: true,
      exp: true
    },
    getAllowedList: () => config.get('auth.entra.allowedGroupIds') || [],
    checkAllowed: (payload, allowedGroupIds) => {
      const tokenGroups = Array.isArray(payload.groups) ? payload.groups : []
      const allowed = tokenGroups.some(group => allowedGroupIds.includes(group))
      return { allowed, failureContext: { tokenGroups, requiredGroups: allowedGroupIds } }
    },
    emptyListMessage: 'No authorized security groups configured',
    unauthorizedMessage: 'Token does not belong to an authorized Security Group'
  })
}
