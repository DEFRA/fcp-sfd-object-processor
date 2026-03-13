import { config } from '../../config/index.js'
import { AUTH_STRATEGY_NAMES } from '../../constants/auth.js'
import { createAuthStrategy } from './create-auth-strategy.js'

/**
 * Builds Hapi JWT strategy options for AWS Cognito authentication.
 * Validates tokens against the Cognito User Pool JWKS endpoint and checks client ID membership.
 * Uses OAuth2 client-credentials flow for machine-to-machine access.
 */
export function getCognitoAuthOptions () {
  const userPoolId = config.get('auth.cognito.userPoolId')

  if (!userPoolId) {
    throw new Error('AUTH_COGNITO_USER_POOL_ID is required when Cognito authentication is enabled')
  }

  const region = userPoolId.split('_')[0]
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`

  return createAuthStrategy({
    strategyName: AUTH_STRATEGY_NAMES.COGNITO,
    jwksUri: `${issuer}/.well-known/jwks.json`,
    verify: {
      aud: false, // Cognito uses client_id claim rather than aud for client identification
      sub: false,
      iss: [issuer],
      nbf: true,
      exp: true
    },
    getAllowedList: () => config.get('auth.cognito.clientIds') || [],
    checkAllowed: (payload, clientIds) => {
      const tokenClientId = payload.client_id
      const allowed = Boolean(tokenClientId && clientIds.includes(tokenClientId))
      return { allowed, failureContext: { clientId: tokenClientId, issuer: payload.iss } }
    },
    emptyListMessage: 'No authorized Cognito client IDs configured',
    unauthorisedMessage: 'Token client_id is not in the list of authorized Cognito client IDs'
  })
}
