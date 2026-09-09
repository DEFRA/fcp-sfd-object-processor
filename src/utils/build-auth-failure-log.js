/**
 * Builds the structured log context for an authentication failure raised inside the JWT strategy's
 * `validate` callback. Uses approved ECS `event.*`, `client.*` and `user_agent.*` fields only.
 *
 * The CDP ingestion pipeline treats a flattened key and a nested key as different fields, so a flat
 * `sourceIp` is not the same field as `client.ip` and neither it nor any other unapproved top-level
 * key is visible in OpenSearch.
 *
 * The additional context callers supply (token type, issuer, provider name, security groups, client
 * id) has no dedicated enforced field, so it is folded into `event.reason` alongside the failure
 * message rather than emitted as keys that would be dropped. These are non-sensitive identifiers
 * from the token rather than the token itself.
 * @param {string} reason - Error reason/message
 * @param {object} request - Hapi request object
 * @param {object} extra - Additional context to fold into the reason (e.g. tokenType, clientId, issuer)
 */
export const buildAuthFailureLog = (reason, request, extra = {}) => {
  const context = Object.entries(extra)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)

  return {
    msg: 'Authentication failed',
    event: {
      type: 'auth_validation_failure',
      action: request.method,
      category: request.path,
      reason: [reason, ...context].join(' | '),
      outcome: 'failure'
    },
    client: {
      address: request.info.remoteAddress
    },
    user_agent: {
      original: request.headers['user-agent']
    }
  }
}
