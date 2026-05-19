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
import {
  buildStatusRequestLog,
  buildStatusResponseLog
} from '../../../../utils/build-uploader-status-log.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')
const uploaderUrl = config.get('uploaderUrl')
const uploaderStatusEndpoint = config.get('uploaderStatusEndpoint')
const cdpUploaderStatusTimeout = config.get('cdpUploaderTimeoutMs')

export const uploaderStatusRoute = {
  method: 'GET',
  path: `${baseUrl}/uploader/status/{uploadId}`,
  options: {
    description: 'Proxy CDP Uploader scan status for an upload session',
    notes: 'Polls CDP Uploader for the current scan status and file details for a given uploadId. Note that this endpoint has multiple response examples based on uploadStatus. If not rendering on the /documentation endpoint, please use the official Swagger Editor (online or the VS Code extension).',
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

      // Construct the upstream service status URL
      const url = `${uploaderUrl}${uploaderStatusEndpoint}/${uploadId}`

      const startTime = Date.now()

      logger.info(buildStatusRequestLog(request, uploadId), 'Forwarding status request to Upstream service')

      // Fetch status from CDP Uploader with a configurable timeout
      let response

      try {
        response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(cdpUploaderStatusTimeout)
        })
      } catch (err) {
        if (err.name === 'TimeoutError') {
          logger.error({ url, uploadId }, 'Upstream service status request timed out')
          throw Boom.gatewayTimeout('Upstream service request timed out')
        }
        logger.error({ error: { message: err.message }, url, uploadId }, 'Upstream service status request failed')
        throw Boom.badGateway('Upstream service request failed')
      }

      // Handle upstream error responses before reading the body
      if (response.status === httpConstants.HTTP_STATUS_NOT_FOUND) {
        logger.info({ uploadId, url }, 'Upstream service returned 404 — upload not found')
        throw Boom.notFound('Upload not found')
      }

      if (!response.ok) {
        const body = await response.text().catch(() => 'Unable to read response body')
        logger.error(
          { statusCode: response.status, body, url, uploadId },
          'Upstream service returned non-2xx response'
        )
        throw Boom.badGateway(`Upstream service returned ${response.status}`)
      }

      // Parse the JSON response body
      let cdpResponse

      try {
        cdpResponse = await response.json()
      } catch (err) {
        logger.error({ error: { message: err.message }, url, uploadId }, 'Failed to parse Upstream service status response')
        throw Boom.badGateway('Invalid response from Upstream service')
      }

      // Validate the response matches the expected CDP Uploader contract
      const { error: validationError } = cdpUploaderStatusResponseSchema.validate(cdpResponse)

      if (validationError) {
        logger.error(
          { error: { message: validationError.message }, uploadId, url },
          'Upstream service status response failed contract validation'
        )
        throw Boom.badGateway('Upstream service response failed validation')
      }

      const duration = Date.now() - startTime

      logger.info(buildStatusResponseLog(uploadId, cdpResponse, duration), 'Upstream service status response received')

      return h.response({ data: mapCdpStatus(cdpResponse) }).code(httpConstants.HTTP_STATUS_OK)
    }
  }
}

const mapCdpStatus = (cdpResponse) => {
  const { uploadStatus, numberOfRejectedFiles, form, metadata } = cdpResponse

  let mappedStatus
  if (uploadStatus === 'ready') {
    mappedStatus = numberOfRejectedFiles === 0 ? 'success' : 'failure'
  } else {
    mappedStatus = 'pending'
  }

  return { uploadStatus: mappedStatus, form, metadata }
}
