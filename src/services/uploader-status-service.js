import { getClient } from '../data/db.js'
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

// Runs every read behind this verdict on one causally consistent session, so a write that
// landed just before this call (e.g. an outbox entry flipping to PERMANENT_FAILURE) is
// guaranteed visible to every read in this function, not just to a read issued later on an
// unrelated connection. Without this, the driver gives no ordering guarantee between an
// acknowledged write on one connection and an immediately following read on another.
export const getLocalVerdictByUploadId = async (uploadId) => {
  const dbSession = getClient().startSession({ causalConsistency: true })

  try {
    const session = await getSessionByUploadId(uploadId, dbSession)

    if (!session?.journeyId) {
      return DEFAULT_PENDING_STATUS
    }

    const statusRecords = await getStatusByCorrelationId(session.journeyId, dbSession)

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

    // Sequential, not Promise.all: both reads share dbSession, and causal consistency only
    // orders operations on a session relative to each other in the order they're issued.
    const metadataRecords = await getMetadataMessagingByFileIds(fileIds, dbSession)
    const outboxRecords = await getOutboxStatusesByFileIds(fileIds, dbSession)

    // Check for permanent delivery failures: a file has a PERMANENT_FAILURE outbox entry
    // AND its corresponding metadata does NOT have a publishedAt timestamp.
    // This ensures we only report failure if delivery truly failed (not just in-flight).
    const outboxByFileId = new Map(
      outboxRecords
        .filter(record => typeof record.payload?.file?.fileId === 'string')
        .map(record => [record.payload.file.fileId, record])
    )

    const hasUnpublishedPermanentFailure = fileIds.some(fileId => {
      const outboxEntry = outboxByFileId.get(fileId)
      const metadata = metadataRecords.find(m => m.file?.fileId === fileId)
      const isPublished = metadata?.messaging?.publishedAt !== undefined && metadata.messaging.publishedAt !== null
      return outboxEntry?.status === PERMANENT_FAILURE && !isPublished
    })

    if (hasUnpublishedPermanentFailure) {
      return {
        uploadStatus: 'failure',
        stage: 'delivery-failed',
        errors: [{ field: 'delivery', errorType: 'permanent-failure' }]
      }
    }

    return ACCEPTED_STATUS
  } finally {
    await dbSession.endSession()
  }
}
