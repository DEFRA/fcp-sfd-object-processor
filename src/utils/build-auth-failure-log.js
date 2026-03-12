/**
 * Builds base log object for authentication failures with request context.
 * @param {string} reason - Error reason/message
 * @param {object} request - Hapi request object
 * @param {object} extra - Additional fields to merge (e.g., tokenType, clientId, issuer)
 */
export const buildAuthFailureLog = (reason, request, extra = {}) => {
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
