import { constants as httpConstants } from 'node:http2'

/**
 * Builds the structured log context for a request rejected with 401 Unauthorized by the
 * `onPreResponse` auth failure hook. Uses approved ECS `event.*`, `client.*` and `user_agent.*`
 * fields only — flat top-level keys are not visible on the CDP logging platform.
 *
 * Token claims (security groups, client_id, issuer) are non-sensitive identifiers rather than
 * the token/secret itself, so they are safe to fold into `event.reason` alongside the failure
 * message. There is no dedicated enforced field for each of them individually.
 * @param {object} request - Hapi request object
 * @param {string} sanitisedMessage - The boom error message describing why auth failed
 */
export const buildAuthFailureResponseLog = (request, sanitisedMessage) => {
  const payload = request.auth?.artifacts?.decoded?.payload
  const tokenGroups = payload?.groups
  const tokenClientId = payload?.client_id
  const tokenIssuer = payload?.iss

  const reason = [
    sanitisedMessage,
    tokenGroups && `groups=${tokenGroups.join(',')}`,
    tokenClientId && `clientId=${tokenClientId}`,
    tokenIssuer && `issuer=${tokenIssuer}`
  ].filter(Boolean).join(' | ')

  return {
    event: {
      type: 'auth_failure',
      action: request.method,
      category: request.path,
      reason,
      outcome: 'failure',
      kind: httpConstants.HTTP_STATUS_UNAUTHORIZED
    },
    client: {
      address: request.info.remoteAddress
    },
    user_agent: {
      original: request.headers['user-agent']
    }
  }
}
