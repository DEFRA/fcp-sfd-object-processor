import { config } from '../config/index.js'
import { getDb } from '../data/db.js'
import { createLogger } from '../logging/logger.js'

const logger = createLogger()

const statusCollection = 'mongo.collections.status'
const statusQueryLimitKey = 'mongo.statusQueryLimit'
const STATUS_QUERY_LIMIT_REACHED = 'status_query_limit_reached'

const insertStatus = async (documents, session = undefined) => {
  const collection = config.get(statusCollection)
  const statusDocuments = Array.isArray(documents) ? documents : [documents]

  const options = session ? { session } : {}
  const result = await getDb().collection(collection).insertMany(statusDocuments, options)

  if (!result.acknowledged) {
    throw new Error('Failed to insert status records')
  }

  return result
}

// The only caller, getLocalVerdictByUploadId in src/services/uploader-status-service.js,
// uses the returned records in two ways, and the limit truncates both:
// - it filters them for validated === false to decide whether the upload was rejected, so a
//   failure recorded after the limit is not seen;
// - it collects their fileId values for the metadata and outbox lookups, so files recorded
//   after the limit are left out of the verdict.
// The limit is therefore set far above the number of records a normal journey produces, and
// a query that returns exactly the limit logs a warning so that truncation is visible.
const getStatusByCorrelationId = async (correlationId, session = undefined) => {
  const collection = config.get(statusCollection)
  const statusQueryLimit = config.get(statusQueryLimitKey)

  const results = await getDb()
    .collection(collection)
    .find({ correlationId }, ...(session ? [{ session }] : []))
    .project({ _id: 0, correlationId: 0 }) // correlationId is internal and never returned to callers
    .sort({ timestamp: 1 })
    .limit(statusQueryLimit)
    .toArray()

  if (results.length === statusQueryLimit) {
    // Carries the count only: no correlationId, no record content, no CRN or SBI
    logger.warn({
      event: {
        type: STATUS_QUERY_LIMIT_REACHED,
        outcome: 'unknown',
        reason: `${statusQueryLimit} status records returned, equal to the configured limit`
      }
    }, 'Status query reached the configured limit; later status records were not read')
  }

  return results
}

export {
  insertStatus,
  getStatusByCorrelationId
}
