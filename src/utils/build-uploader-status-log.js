import { constants as httpConstants } from 'node:http2'

/**
 * Builds the structured log context for an outbound status request to the upstream service.
 * Uses approved ECS event.* fields only.
 * @param {object} request - Hapi request object
 * @param {string} uploadId - The upload session identifier
 */
export const buildStatusRequestLog = (request, uploadId) => ({
  event: {
    type: 'status_check',
    action: request.method,
    category: request.path,
    reference: uploadId,
    reason: request.auth?.artifacts?.decoded?.payload?.client_id
  }
})

/**
 * Builds the structured log context for a successful upstream service status response.
 * Uses approved ECS event.* fields only.
 * @param {string} uploadId - The upload session identifier
 * @param {object} upstreamResponse - Validated response body from the upstream service
 * @param {number} duration - Round-trip duration in milliseconds (converted to nanoseconds internally)
 */
export const buildStatusResponseLog = (uploadId, upstreamResponse, duration) => ({
  event: {
    type: 'status_check',
    outcome: 'success',
    duration: duration * 1_000_000,
    reference: uploadId,
    reason: upstreamResponse.uploadStatus,
    kind: httpConstants.HTTP_STATUS_OK
  }
})
