import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'
import { randomUUID } from 'node:crypto'

import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import { httpClient, TimeoutError } from '../../../../http/client.js'
import { initiatePayloadSchema, initiateResponseSchema } from './schema.js'
import { metricsCounter } from '../../../../api/common/helpers/metrics.js'
import { insertSession } from '../../../../repos/sessions.js'
import { JOURNEY_ID_PARAM } from '../../../../constants/correlation.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')

// Appends the journeyId as a query parameter to the configured callback URL, using URL/
// URLSearchParams so a CDP_UPLOADER_CALLBACK_URL that already carries a query string is
// merged correctly rather than string-concatenated. Falls back to naive concatenation when
// the configured value isn't a valid absolute URL (e.g. missing config), and returns the
// callback URL unchanged when there is no journeyId or callback URL to append to.
const appendJourneyId = (callbackUrl, journeyId) => {
  if (!callbackUrl || !journeyId) {
    return callbackUrl
  }

  try {
    const url = new URL(callbackUrl)
    url.searchParams.set(JOURNEY_ID_PARAM, journeyId)
    return url.toString()
  } catch {
    const separator = callbackUrl.includes('?') ? '&' : '?'
    return `${callbackUrl}${separator}${JOURNEY_ID_PARAM}=${journeyId}`
  }
}

export const buildCdpUploaderPayload = (clientPayload, journeyId) => {
  return {
    redirect: clientPayload.redirect,
    s3Bucket: config.get('cdpUploaderS3Bucket'),
    s3Path: config.get('cdpUploaderS3Path'),
    callback: appendJourneyId(config.get('cdpUploaderCallbackUrl'), journeyId),
    mimeTypes: config.get('cdpUploaderMimeTypes'),
    maxFileSize: config.get('cdpUploaderMaxFileSize'),
    metadata: clientPayload.metadata
  }
}

export const rewriteResponseUrls = (cdpResponse) => {
  const { uploadId } = cdpResponse
  const externalUrl = config.get('uploaderExternalUrl') || config.get('uploaderUrl')
  return {
    uploadId,
    uploadUrl: `${externalUrl}/upload-and-scan/${uploadId}`,
    statusUrl: `${baseUrl}/uploader/status/${uploadId}`
  }
}

export const uploaderInitiateRoute = {
  method: 'POST',
  path: `${baseUrl}/uploader/initiate`,
  options: {
    description: 'Initiate a browser upload via upstream service',
    notes: 'Proxies initiation requests to upstream service, enriching with server-side config and rewriting response URLs.',
    tags: ['api', 'uploader'],
    validate: {
      payload: initiatePayloadSchema,
      options: { abortEarly: false },
      failAction: async (_request, _h, err) => {
        logger.error({ error: { message: err.message } }, '/uploader/initiate validation failed')
        await metricsCounter('initiate_validation_failures')
        throw err
      }
    },
    response: {
      status: initiateResponseSchema
    },
    handler: async (request, h) => {
      const uploaderUrl = config.get('uploaderUrl')
      const initiateEndpoint = config.get('uploaderInitiateEndpoint')
      const url = `${uploaderUrl}${initiateEndpoint}`

      // Minted once per upload; carried on the callback URL and the persisted session so
      // the callback can be joined back to this initiate request end to end (see FLS1-175).
      const journeyId = randomUUID()

      const payload = buildCdpUploaderPayload(request.payload, journeyId)

      logger.info({ url }, 'Forwarding initiate request to Upstream service')

      let response

      try {
        response = await httpClient(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      } catch (err) {
        if (err instanceof TimeoutError) {
          logger.error({ url, retry: err.retryMetadata ?? null }, 'Upstream service request timed out')
          throw Boom.gatewayTimeout('Upstream service request timed out')
        }
        logger.error({ error: { message: err.message }, url, retry: err.retryMetadata ?? null }, 'Upstream service request failed')
        throw Boom.badGateway('Upstream service request failed')
      }

      if (!response.ok) {
        const body = await response.text().catch(() => 'Unable to read response body')
        logger.error(
          { statusCode: response.status, body, url },
          'Upstream service returned non-2xx response'
        )
        throw Boom.badGateway(`Upstream service returned ${response.status}`)
      }

      let cdpResponse
      try {
        cdpResponse = await response.json()
      } catch (err) {
        logger.error({ error: { message: err.message }, url }, 'Failed to parse Upstream service response')
        throw Boom.badGateway('Invalid response from Upstream service')
      }

      if (!cdpResponse?.uploadId) {
        logger.error({ cdpResponse, url }, 'Upstream service response missing uploadId')
        throw Boom.badGateway('Invalid response from Upstream service')
      }

      const data = { ...rewriteResponseUrls(cdpResponse), journeyId }

      try {
        await insertSession({
          uploadId: cdpResponse.uploadId,
          journeyId,
          metadata: request.payload.metadata,
          timestamp: new Date()
        })
      } catch (sessionErr) {
        logger.error({ error: { message: sessionErr.message }, uploadId: cdpResponse.uploadId, journeyId }, 'Failed to persist upload session record')
      }

      return h.response({ data }).code(httpConstants.HTTP_STATUS_OK)
    }
  }
}
