/**
 * Build the structured log payload for an oversized tracing header rejection.
 *
 * @param {object} request - The inbound HTTP request.
 * @param {number} headerLength - The offending `x-cdp-request-id` header length.
 * @returns {{ event: { type: string, action: string, reason: string, outcome: string }, http: { response: { status_code: number } }, url: { path: string } }}
 *   The ECS-style event payload to log when the header exceeds the configured limit.
 */
export const buildOversizedRequestIdLog = (request, headerLength) => ({
  event: {
    type: 'request_id_too_long',
    action: request.method,
    category: 'api',
    reason: `header_length=${headerLength}`,
    outcome: 'failure'
  },
  http: {
    response: {
      status_code: 400
    }
  },
  url: {
    path: request.path
  }
})
