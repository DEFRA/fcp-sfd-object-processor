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
import { getSessionByUploadId } from '../../../../repos/sessions.js'
import { getStatusByCorrelationId } from '../../../../repos/status.js'
import { getMetadataMessagingByFileIds } from '../../../../repos/metadata.js'
import { getOutboxStatusesByFileIds } from '../../../../repos/outbox.js'
import { metricsCounter } from '../../../../api/common/helpers/metrics.js'
import {
  buildStatusRequestLog,
  buildStatusResponseLog
} from '../../../../utils/build-uploader-status-log.js'
import { normaliseFormFields } from '../../../../utils/normalise-form-fields.js'
import { flattenFormValues } from '../../../../utils/flatten-form-files.js'
import { splitJourneyId } from '../../../../utils/split-journey-id.js'
import { PERMANENT_FAILURE } from '../../../../constants/outbox.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')
const uploaderUrl = config.get('uploaderUrl')
const uploaderStatusEndpoint = config.get('uploaderStatusEndpoint')
const DEFAULT_PENDING_STATUS = Object.freeze({
  uploadStatus: 'pending',
  stage: 'awaiting-callback',
  errors: null
})
const ACCEPTED_STATUS = Object.freeze({
  uploadStatus: 'success',
  stage: 'accepted',
  errors: null
})

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

      const mappedStatus = await mapCdpStatus(uploadId, validatedResponse)

      return h.response({ data: mappedStatus }).code(httpConstants.HTTP_STATUS_OK)
    }
  }
}

const sanitiseErrorsForResponse = (errors) => {
  if (!Array.isArray(errors) || errors.length === 0) {
    return []
  }

  return errors.map((error) => ({
    field: error?.field ?? 'payload',
    errorType: error?.errorType ?? 'unknown'
  }))
}

const extractScannerErrors = (form) => {
  const formValues = flattenFormValues(form)
  const errors = formValues
    .filter(value => value && typeof value === 'object' && value.fileStatus === 'rejected')
    .map((file) => ({
      field: file.filename || 'file',
      errorType: file.errorCode || file.errorMessage || 'rejected-by-scanner'
    }))

  return errors.length > 0 ? errors : [{ field: 'file', errorType: 'rejected-by-scanner' }]
}

const mapLocalVerdict = async (uploadId) => {
  const session = await getSessionByUploadId(uploadId)

  if (!session?.journeyId) {
    return DEFAULT_PENDING_STATUS
  }

  const statusRecords = await getStatusByCorrelationId(session.journeyId)

  if (statusRecords.length === 0) {
    return DEFAULT_PENDING_STATUS
  }

  const failedStatusRecords = statusRecords.filter(record => record.validated === false)
  if (failedStatusRecords.length > 0) {
    const processorErrors = sanitiseErrorsForResponse(
      failedStatusRecords.flatMap(record => Array.isArray(record.errors) ? record.errors : [])
    )

    return {
      uploadStatus: 'failure',
      stage: 'rejected-by-processor',
      errors: processorErrors.length > 0
        ? processorErrors
        : [{ field: 'payload', errorType: 'validation-failed' }]
    }
  }

  const fileIds = statusRecords
    .map(record => record.fileId)
    .filter(fileId => typeof fileId === 'string' && fileId.length > 0)

  const [metadataRecords, outboxRecords] = await Promise.all([
    getMetadataMessagingByFileIds(fileIds),
    getOutboxStatusesByFileIds(fileIds)
  ])

  const hasPublishedAt = metadataRecords.some(record => record.messaging?.publishedAt)
  const hasPermanentFailure = outboxRecords.some(record => record.status === PERMANENT_FAILURE)
  const hasRetryingOrDelivered = outboxRecords.some(record => record.status !== PERMANENT_FAILURE)

  if (!hasPublishedAt && hasPermanentFailure) {
    return {
      uploadStatus: 'failure',
      stage: 'delivery-failed',
      errors: [{ field: 'delivery', errorType: 'permanent-failure' }]
    }
  }

  if (hasPublishedAt || hasRetryingOrDelivered) {
    return ACCEPTED_STATUS
  } else {
    return ACCEPTED_STATUS
  }
}

const mapCdpStatus = async (uploadId, cdpResponse) => {
  const { uploadStatus, numberOfRejectedFiles, form, metadata } = cdpResponse

  let mappedStatus = {
    uploadStatus: 'pending',
    stage: 'scanning',
    errors: null
  }

  if (uploadStatus === 'ready' && numberOfRejectedFiles > 0) {
    mappedStatus = {
      uploadStatus: 'failure',
      stage: 'rejected-by-scanner',
      errors: extractScannerErrors(form)
    }
  } else if (uploadStatus === 'ready') {
    mappedStatus = await mapLocalVerdict(uploadId)
  }

  // CDP Uploader echoes the metadata supplied at initiate verbatim, so it carries the
  // journey id. This route proxies that response straight to the client and is not on the
  // callback path, so it strips the id independently of the callback boundary.
  const { metadata: metadataWithoutJourneyId } = splitJourneyId(metadata)

  return {
    uploadStatus: mappedStatus.uploadStatus,
    stage: mappedStatus.stage,
    errors: mappedStatus.errors,
    form: normaliseFormFields(form),
    metadata: metadataWithoutJourneyId
  }
}
