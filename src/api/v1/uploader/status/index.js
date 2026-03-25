import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'

import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import {
  uploaderStatusParamsSchema,
  cdpUploaderStatusResponseSchema,
  uploaderStatusResponseSchema
} from './schema.js'
import { metricsCounter } from '../../../../api/common/helpers/metrics.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')

export const uploaderStatusRoute = {
  method: 'GET',
  path: `${baseUrl}/uploader/status/{uploadId}`,
  options: {
    description: 'Proxy CDP Uploader scan status for an upload session',
    notes: 'Polls CDP Uploader for the current scan status and file details for a given uploadId.',
    tags: ['api', 'uploader'],
    validate: {
      params: uploaderStatusParamsSchema,
      options: { abortEarly: false },
      failAction: async (_request, _h, err) => {
        logger.error({ error: { message: err.message } }, '/uploader/status validation failed')
        await metricsCounter('status_validation_failures')
        throw err
      }
    },
    response: {
      status: uploaderStatusResponseSchema
    },
    handler: async (request, h) => {
      const { uploadId } = request.params
      const uploaderUrl = config.get('uploaderUrl')
      const uploaderStatusEndpoint = config.get('uploaderStatusEndpoint')
      const url = `${uploaderUrl}${uploaderStatusEndpoint}/${uploadId}`

      const startTime = Date.now()

      logger.info(
        {
          event: 'status_check',
          uploadId,
          path: request.path,
          method: request.method,
          clientId: request.auth?.artifacts?.decoded?.payload?.client_id
        },
        'Forwarding status request to CDP Uploader'
      )

      let response

      try {
        response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(config.get('cdpUploaderTimeoutMs'))
        })
      } catch (err) {
        if (err.name === 'TimeoutError') {
          logger.error({ url, uploadId }, 'CDP Uploader status request timed out')
          throw Boom.gatewayTimeout('CDP Uploader request timed out')
        }
        logger.error({ error: { message: err.message }, url, uploadId }, 'CDP Uploader status request failed')
        throw Boom.badGateway('CDP Uploader request failed')
      }

      if (response.status === httpConstants.HTTP_STATUS_NOT_FOUND) {
        logger.info({ uploadId, url }, 'CDP Uploader returned 404 — upload not found')
        throw Boom.notFound('Upload not found')
      }

      if (!response.ok) {
        const body = await response.text().catch(() => 'Unable to read response body')
        logger.error(
          { statusCode: response.status, body, url, uploadId },
          'CDP Uploader returned non-2xx response'
        )
        throw Boom.badGateway(`CDP Uploader returned ${response.status}`)
      }

      let cdpResponse

      try {
        cdpResponse = await response.json()
      } catch (err) {
        logger.error({ error: { message: err.message }, url, uploadId }, 'Failed to parse CDP Uploader status response')
        throw Boom.badGateway('Invalid response from CDP Uploader')
      }

      const { error: validationError } = cdpUploaderStatusResponseSchema.validate(cdpResponse)

      if (validationError) {
        logger.error(
          { error: { message: validationError.message }, uploadId, url },
          'CDP Uploader status response failed contract validation'
        )
        throw Boom.badGateway('CDP Uploader response failed validation')
      }

      const duration = Date.now() - startTime

      logger.info(
        {
          event: 'status_check_response',
          uploadId,
          uploadStatus: cdpResponse.uploadStatus,
          statusCode: httpConstants.HTTP_STATUS_OK,
          duration
        },
        'CDP Uploader status response received'
      )

      return h.response({ data: cdpResponse }).code(httpConstants.HTTP_STATUS_OK)
    }
  }
}
