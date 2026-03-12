import { config } from '../../config/index.js'
import { createLogger } from '../../logging/logger.js'
import { buildAuthFailureLog } from '../../utils/build-auth-failure-log.js'

const logger = createLogger()
const tenant = config.get('auth.entra.tenant')
const allowedGroupIds = config.get('auth.entra.allowedGroupIds') || []
const authFailedMessage = 'Authentication failed'

/**
 * Builds Hapi JWT strategy options for Microsoft Entra ID (Azure AD) authentication.
 * Validates tokens against the tenant's JWKS endpoint and checks security group membership.
 */
export function getEntraAuthOptions () {
  return {
    keys: {
      uri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`
    },
    verify: {
      aud: false,
      sub: false,
      iss: [`https://sts.windows.net/${tenant}/`, `https://login.microsoftonline.com/${tenant}/v2.0`], // Accept both v1.0 and v2.0 tokens
      nbf: true,
      exp: true
    },
    validate: async (artifacts, request, _h) => {
      const { payload } = artifacts.decoded

      if (payload.typ && payload.typ !== 'JWT' && payload.typ !== 'at+jwt') {
        const errorMessage = 'Provided token is not an access token'
        logger.warn(buildAuthFailureLog(errorMessage, request, { tokenType: payload.typ, strategy: 'entra' }))
        return { isValid: false, errorMessage }
      }

      const tokenGroups = Array.isArray(payload.groups) ? payload.groups : []

      // If no allowed groups are configured, reject the token
      if (allowedGroupIds.length === 0) {
        const errorMessage = 'No authorized security groups configured'
        logger.warn(buildAuthFailureLog(errorMessage, request, { strategy: 'entra' }))
        return { isValid: false, errorMessage }
      }

      // Check if token has any matching security groups
      if (!tokenGroups.some(group => allowedGroupIds.includes(group))) {
        const errorMessage = 'Token does not belong to an authorized Security Group'
        logger.warn(buildAuthFailureLog(errorMessage, request, { tokenGroups, requiredGroups: allowedGroupIds, strategy: 'entra' }))
        return { isValid: false, errorMessage }
      }

      const credentials = {
        token: payload,
        principalId: payload.sub
      }

      return { isValid: true, credentials }
    }
  }
}
