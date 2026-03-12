import { config } from '../../config/index.js'
import { createLogger } from '../../logging/logger.js'

const logger = createLogger()

/**
 * Builds base log object for authentication failures with request context.
 * @param {string} reason - Error reason/message
 * @param {object} request - Hapi request object
 * @param {object} extra - Additional fields to merge (e.g., tokenType, clientId, issuer)
 */
const buildAuthFailureLog = (reason, request, extra = {}) => {
  return {
    msg: 'Authentication failed',
    reason,
    strategy: 'cognito',
    path: request.path,
    method: request.method,
    sourceIp: request.info.remoteAddress,
    ...extra
  }
}
/**
 * Builds Hapi JWT strategy options for AWS Cognito authentication.
 * Validates tokens against the Cognito User Pool JWKS endpoint and checks client ID membership.
 * Uses OAuth2 client-credentials flow for machine-to-machine access.
 */
export function getCognitoAuthOptions () {
  const userPoolId = config.get('auth.cognito.userPoolId')
  const clientIds = config.get('auth.cognito.clientIds') || []
  const region = userPoolId.split('_')[0]
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`

  return {
    keys: {
      uri: `${issuer}/.well-known/jwks.json`
    },
    verify: {
      aud: false, // Cognito uses client_id claim rather than aud for client identification
      sub: false,
      iss: [issuer],
      nbf: true,
      exp: true
    },
    validate: async (artifacts, request, _h) => {
      const { payload } = artifacts.decoded

      if (payload.typ && payload.typ !== 'JWT' && payload.typ !== 'at+jwt') {
        const errorMessage = 'Provided token is not an access token'
        logger.warn(buildAuthFailureLog(errorMessage, request, { tokenType: payload.typ, issuer: payload.iss }))
        return { isValid: false, errorMessage }
      }

      if (clientIds.length === 0) {
        const errorMessage = 'No authorized Cognito client IDs configured'
        logger.warn(buildAuthFailureLog(errorMessage, request))
        return { isValid: false, errorMessage }
      }

      const tokenClientId = payload.client_id
      if (!tokenClientId || !clientIds.includes(tokenClientId)) {
        const errorMessage = 'Token client_id is not in the list of authorized Cognito client IDs'
        logger.warn(buildAuthFailureLog(errorMessage, request, { clientId: tokenClientId, issuer: payload.iss }))
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
