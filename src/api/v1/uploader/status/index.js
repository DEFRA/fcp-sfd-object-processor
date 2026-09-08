import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'

import { createLogger } from '../../../../logging/logger.js'
import { config } from '../../../../config/index.js'
import { httpClient, TimeoutError } from '../../../../http/client.js'
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
import { normaliseFormFields } from '../../../../utils/normalise-form-fields.js'
import { getStatusByUploadRef } from '../../../../repos/status.js'
import { getSessionByUploadId } from '../../../../repos/sessions.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')
const uploaderUrl = config.get('uploaderUrl')
const uploaderStatusEndpoint = config.get('uploaderStatusEndpoint')

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

      // Fetch status from CDP Uploader with configured timeout and retry policy
      let response

      try {
        response = await httpClient(url, { method: 'GET' })
      } catch (err) {
        if (err instanceof TimeoutError) {
          logger.error({ url, uploadId, retry: err.retryMetadata ?? null }, 'Upstream service status request timed out')
          throw Boom.gatewayTimeout('Upstream service request timed out')
        }
        logger.error({ error: { message: err.message }, url, uploadId, retry: err.retryMetadata ?? null }, 'Upstream service status request failed')
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
      const { error: validationError, value: validatedResponse } = cdpUploaderStatusResponseSchema.validate(cdpResponse)

      if (validationError) {
        logger.error(
          { error: { message: validationError.message }, uploadId, url },
          'Upstream service status response failed contract validation'
        )
        throw Boom.badGateway('Upstream service response failed validation')
      }

      const duration = Date.now() - startTime

      logger.info(buildStatusResponseLog(uploadId, validatedResponse, duration), 'Upstream service status response received')

      return h.response({ data: await mapCdpStatus(validatedResponse, uploadId) }).code(httpConstants.HTTP_STATUS_OK)
    }
  }
}

const isAwaitingCallbackTimedOut = async (uploadId) => {
  const session = await getSessionByUploadId(uploadId)

  if (!session?.timestamp) {
    return undefined
  }

  const timeoutMs = config.get('uploaderStatusAwaitingCallbackTimeoutMs')
  return Date.now() - new Date(session.timestamp).getTime() > timeoutMs
}

const mapCdpStatus = async (cdpResponse, uploadId) => {
  const { uploadStatus, numberOfRejectedFiles, form, metadata } = cdpResponse
  const { uploadRef, ...responseMetadata } = metadata ?? {}

  let mappedStatus
  let stage
  let correlationId
  let errors
  let timedOut

  if (uploadStatus !== 'ready') {
    mappedStatus = 'pending'
    stage = 'scanning'
  } else if (numberOfRejectedFiles > 0) {
    mappedStatus = 'failure'
    stage = 'rejected-by-scanner'
  } else {
    const statusRecords = uploadRef ? await getStatusByUploadRef(uploadRef) : []

    if (statusRecords.length === 0) {
      mappedStatus = 'pending'
      stage = 'awaiting-callback'
      timedOut = await isAwaitingCallbackTimedOut(uploadId)
    } else {
      correlationId = statusRecords[0].correlationId
      const failedRecords = statusRecords.filter(record => record.validated === false)

      if (failedRecords.length > 0) {
        mappedStatus = 'failure'
        stage = 'rejected-by-processor'
        // receivedValue echoes user-submitted content and this response is browser facing
        errors = failedRecords.flatMap(record => record.errors ?? []).map(({ receivedValue, ...error }) => error)
      } else {
        mappedStatus = 'success'
        stage = 'accepted'
      }
    }
  }

  return {
    uploadStatus: mappedStatus,
    stage,
    ...(correlationId !== undefined && { correlationId }),
    ...(errors !== undefined && { errors }),
    ...(timedOut !== undefined && { timedOut }),
    form: normaliseFormFields(form),
    metadata: responseMetadata
  }
}
