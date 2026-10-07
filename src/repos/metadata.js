import { config } from '../config/index.js'
import { NotFoundError } from '../errors/not-found-error.js'
import { getDb } from '../data/db.js'
import { normaliseFormFields } from '../utils/normalise-form-fields.js'
import { assertCorrelationId } from '../utils/assert-correlation-id.js'

const metadataCollection = 'mongo.collections.uploadMetadata'
const noDocumentsFoundError = 'No documents found'

const getS3ReferenceAndSbiByFileId = async (fileId) => {
  const collection = config.get(metadataCollection)
  const document = await getDb().collection(collection)
    .findOne(
      { 'file.fileId': fileId },
      { projection: { s3: 1, 'metadata.sbi': 1 } }) // return s3 plus SBI for read-audit attribution

  if (document === null) {
    throw new NotFoundError(noDocumentsFoundError)
  }

  return document
}

const getMetadataByFileId = async (fileId) => {
  const collection = config.get(metadataCollection)
  const document = await getDb().collection(collection)
    .findOne(
      { 'file.fileId': fileId },
      { projection: { messaging: 1 } })

  if (document === null) {
    throw new NotFoundError(noDocumentsFoundError)
  }

  return document
}

// Format the raw payload received from the CDP Uploader before saving it in the DB
// removes any formData that is not a file upload
// creates subdocuments to organise data
// normalises grouped arrays to indexed field names and filters to file uploads
// correlationId is supplied by the caller and is the journey id resolved at the callback
// boundary, so that one identifier covers the whole upload from initiate to CRM. It is
// required: this is the point at which it first reaches a document, so it is guarded before
// anything is built. See src/utils/assert-correlation-id.js for why this throws where the
// callback boundary does not.

const formatInboundMetadata = (payload, correlationId) => {
  assertCorrelationId(correlationId)

  const { metadata, uploadStatus, numberOfRejectedFiles } = payload

  // Re-key grouped arrays first, then remove anything without a fileId
  const normalisedForm = normaliseFormFields(payload.form)
  const filteredFormData = Object.values(normalisedForm ?? {}).filter(data => typeof data === 'object' && data?.fileId)

  // all files uploaded together are grouped via the same correlationId
  const filesInBatch = filteredFormData.length

  return filteredFormData.map((formUpload) => {
    return {
      raw: {
        uploadStatus,
        numberOfRejectedFiles,
        ...formUpload
      },
      metadata,
      file: {
        fileId: formUpload.fileId,
        filename: formUpload.filename,
        contentType: formUpload.contentType,
        fileStatus: formUpload.fileStatus
      },
      s3: {
        key: formUpload.s3Key,
        bucket: formUpload.s3Bucket
      },
      messaging: {
        publishedAt: null,
        correlationId,
        filesInBatch
      }
    }
  })
}

/**
 * Reads one page of upload metadata for an SBI, newest first.
 * Requests one document more than the page size so that the presence of a further page
 * is known without a separate count query.
 * @param {number} sbi
 * @param {{ pageSize: number, after?: import('mongodb').ObjectId }} options
 * @returns {Promise<{ documents: object[], hasMore: boolean, nextCursor: string|null }>}
 */
const getMetadataPageBySbi = async (sbi, { pageSize, after }) => {
  const collection = config.get(metadataCollection)

  const results = await getDb().collection(collection)
    .find({ 'metadata.sbi': sbi, ...(after && { _id: { $lt: after } }) })
    .project({ metadata: 1, file: 1 }) // only return the metadata and file keys
    .sort({ _id: -1 })
    .limit(pageSize + 1)
    .toArray()

  // an empty first page means the SBI has no uploads; an empty cursor page is simply the end
  if (results.length === 0 && !after) {
    throw new NotFoundError(noDocumentsFoundError)
  }

  const hasMore = results.length > pageSize
  const documents = hasMore ? results.slice(0, pageSize) : results

  return {
    documents,
    hasMore,
    nextCursor: hasMore ? documents.at(-1)._id.toHexString() : null
  }
}

const persistMetadata = async (documents, session) => {
  const collection = config.get(metadataCollection)

  const result = await getDb().collection(collection).insertMany(documents, { session })

  if (!result.acknowledged) {
    throw new Error('Failed to insert, no acknowledgement from database')
  }

  return result
}

const bulkUpdatePublishedAtDate = async (session, fileIds) => {
  const collection = config.get(metadataCollection)

  const filter = { 'file.fileId': { $in: fileIds } }

  const updateDoc = {
    $set: {
      'messaging.publishedAt': new Date()
    }
  }
  const updateResult = await getDb().collection(collection).updateMany(filter, updateDoc, { session })

  if (!updateResult.acknowledged) {
    throw new Error('Failed to update publishedAt status')
  }

  return updateResult
}

const getMetadataMessagingByFileIds = async (fileIds, session = undefined) => {
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return []
  }

  const collection = config.get(metadataCollection)

  return getDb().collection(collection)
    .find({ 'file.fileId': { $in: fileIds } }, ...(session ? [{ session }] : []))
    .project({ _id: 0, 'file.fileId': 1, 'messaging.publishedAt': 1 })
    .toArray()
}

export {
  getMetadataPageBySbi,
  persistMetadata,
  formatInboundMetadata,
  getS3ReferenceAndSbiByFileId,
  getMetadataByFileId,
  bulkUpdatePublishedAtDate,
  getMetadataMessagingByFileIds
}
