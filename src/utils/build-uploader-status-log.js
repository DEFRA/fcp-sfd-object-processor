import { constants as httpConstants } from 'node:http2'

/**
 * Builds the structured log context for an outbound status request to CDP Uploader.
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
 * Builds the structured log context for a successful CDP Uploader status response.
 * Uses approved ECS event.* fields only.
 * @param {string} uploadId - The upload session identifier
 * @param {object} cdpResponse - Validated response body from CDP Uploader
 * @param {number} duration - Round-trip duration in milliseconds (converted to nanoseconds internally)
 */
export const buildStatusResponseLog = (uploadId, cdpResponse, duration) => ({
  event: {
    type: 'status_check',
    outcome: 'success',
    duration: duration * 1_000_000,
    reference: uploadId,
    reason: cdpResponse.uploadStatus,
    kind: httpConstants.HTTP_STATUS_OK
  }
})
