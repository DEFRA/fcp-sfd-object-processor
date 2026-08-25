import { config } from '../../config/index.js'
import { AUTH_PROVIDER_NAMES } from '../../constants/auth.js'

/**
 * Builds the Cognito provider descriptor consumed by `createAuthStrategy`. Validates tokens against
 * the Cognito User Pool JWKS endpoint and checks client ID membership. Used by the OAuth2
 * client-credentials flow for machine-to-machine access.
 * @returns {import('./create-auth-strategy.js').AuthProvider}
 */
export function getCognitoAuthProvider () {
  const userPoolId = config.get('auth.cognito.userPoolId')

  if (!userPoolId) {
    throw new Error('AUTH_COGNITO_USER_POOL_ID is required when Cognito authentication is enabled')
  }

  const region = userPoolId.split('_')[0]
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`

  return {
    name: AUTH_PROVIDER_NAMES.COGNITO,
    jwksUris: [`${issuer}/.well-known/jwks.json`],
    issuers: [issuer],
    // Cognito has a single fixed list of allowed client IDs; it does not need the token
    // payload to resolve it, unlike the multi-tenant Entra provider.
    getAllowedList: () => config.get('auth.cognito.clientIds') || [],
    checkAllowed: (payload, clientIds) => {
      const tokenClientId = payload.client_id
      const allowed = Boolean(tokenClientId && clientIds.includes(tokenClientId))
      return { allowed, failureContext: { clientId: tokenClientId, issuer: payload.iss } }
    },
    emptyListMessage: 'No authorized Cognito client IDs configured',
    unauthorisedMessage: 'Token client_id is not in the list of authorized Cognito client IDs'
  }
}
