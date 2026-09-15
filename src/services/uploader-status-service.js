import { getSessionByUploadId } from '../repos/sessions.js'
import { getStatusByCorrelationId } from '../repos/status.js'
import { getMetadataMessagingByFileIds } from '../repos/metadata.js'
import { getOutboxStatusesByFileIds } from '../repos/outbox.js'
import { PERMANENT_FAILURE } from '../constants/outbox.js'

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

const sanitiseErrorsForResponse = (errors) => {
  if (!Array.isArray(errors) || errors.length === 0) {
    return []
  }

  return errors.map((error) => ({
    field: error?.field ?? 'payload',
    errorType: error?.errorType ?? 'unknown'
  }))
}

export const getLocalVerdictByUploadId = async (uploadId) => {
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

  const publishedFileIds = new Set(
    metadataRecords
      .filter(record => record.messaging?.publishedAt && typeof record.file?.fileId === 'string')
      .map(record => record.file.fileId)
  )

  const hasUnpublishedPermanentFailure = outboxRecords.some(
    record => record.status === PERMANENT_FAILURE && !publishedFileIds.has(record.payload?.file?.fileId)
  )

  if (hasUnpublishedPermanentFailure) {
    return {
      uploadStatus: 'failure',
      stage: 'delivery-failed',
      errors: [{ field: 'delivery', errorType: 'permanent-failure' }]
    }
  }

  return ACCEPTED_STATUS
}
