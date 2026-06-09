import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'

import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import { httpClient, TimeoutError } from '../../../../http/client.js'
import { initiatePayloadSchema, initiateResponseSchema } from './schema.js'
import { metricsCounter } from '../../../../api/common/helpers/metrics.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')

export const buildCdpUploaderPayload = (clientPayload) => {
  return {
    redirect: clientPayload.redirect,
    s3Bucket: config.get('cdpUploaderS3Bucket'),
    s3Path: config.get('cdpUploaderS3Path'),
    callback: config.get('cdpUploaderCallbackUrl'),
    mimeTypes: config.get('cdpUploaderMimeTypes'),
    maxFileSize: config.get('cdpUploaderMaxFileSize'),
    metadata: clientPayload.metadata
  }
}

export const rewriteResponseUrls = (cdpResponse) => {
  const { uploadId } = cdpResponse
  const uploaderUrl = config.get('uploaderUrl')
  return {
    uploadId,
    uploadUrl: `${uploaderUrl}/upload-and-scan/${uploadId}`,
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

      const payload = buildCdpUploaderPayload(request.payload)

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

      return h.response({ data }).code(httpConstants.HTTP_STATUS_OK)
    }
  }
}
