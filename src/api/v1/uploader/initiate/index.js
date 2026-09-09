import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'
import { randomUUID } from 'node:crypto'

import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import { httpClient, TimeoutError } from '../../../../http/client.js'
import { initiatePayloadSchema, initiateResponseSchema } from './schema.js'
import { metricsCounter } from '../../../../api/common/helpers/metrics.js'
import { insertSession } from '../../../../repos/sessions.js'
import { JOURNEY_ID_KEY } from '../../../../constants/correlation.js'
import { runWithCorrelationId } from '../../../../logging/correlation-id-store.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')

// The journey id travels in the uploader `metadata` object because CDP Uploader echoes
// that object back verbatim on the callback, and the callback body has no other passthrough.
// Enrichment is confined to the outbound payload: the client's own metadata object is left
// untouched, so nothing else in this service sees the id inside a business object.
export const buildCdpUploaderPayload = (clientPayload, journeyId) => {
  return {
    redirect: clientPayload.redirect,
    s3Bucket: config.get('cdpUploaderS3Bucket'),
    s3Path: config.get('cdpUploaderS3Path'),
    callback: config.get('cdpUploaderCallbackUrl'),
    mimeTypes: config.get('cdpUploaderMimeTypes'),
    maxFileSize: config.get('cdpUploaderMaxFileSize'),
    metadata: { ...clientPayload.metadata, ...(journeyId ? { [JOURNEY_ID_KEY]: journeyId } : {}) }
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
      // Minted once per upload and carried both to CDP Uploader and onto the session record,
      // so the callback can be joined back to this initiate request end to end (FLS1-175).
      // Deliberately not returned to the client; it is an internal correlation identifier.
      const journeyId = randomUUID()

      // Entered here, not only at the callback, so that the request which mints the
      // identifier also carries it on every line it logs. The pino mixin reads the store
      // and emits the value as transaction.id.
      return runWithCorrelationId(journeyId, async () => {
        const uploaderUrl = config.get('uploaderUrl')
        const initiateEndpoint = config.get('uploaderInitiateEndpoint')
        const url = `${uploaderUrl}${initiateEndpoint}`

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

        const data = rewriteResponseUrls(cdpResponse)

        try {
          await insertSession({
            uploadId: cdpResponse.uploadId,
            journeyId,
            metadata: request.payload.metadata,
            timestamp: new Date()
          })
        } catch (sessionErr) {
          // The journeyId is logged here because a swallowed insert failure later causes the
          // callback to fall back to a generated id; the two events can then be joined by hand.
          logger.error({ error: { message: sessionErr.message }, uploadId: cdpResponse.uploadId, journeyId }, 'Failed to persist upload session record')
        }

        return h.response({ data }).code(httpConstants.HTTP_STATUS_OK)
      })
    }
  }
}
