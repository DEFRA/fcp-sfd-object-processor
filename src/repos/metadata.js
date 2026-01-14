import { config } from '../config/index.js'
import { NotFoundError } from '../errors/not-found-error.js'
import { db } from '../data/db.js'

const metadataCollection = 'mongo.collections.uploadMetadata'

const getS3ReferenceByFileId = async (fileId) => {
  const collection = config.get(metadataCollection)
  const document = await db.collection(collection)
    .findOne(
      { 'file.fileId': fileId },
      { projection: { s3: 1 } }) // only return the s3Data

  if (document === null) {
    throw new NotFoundError('No documents found')
  }

  return document
}

// Format the raw payload received from the CDP Uploader before saving it in the DB
// removes any formData that is not a file upload
// creates subdocuments to organise data

const formatInboundMetadata = (payload) => {
  const { metadata, uploadStatus, numberOfRejectedFiles } = payload

  const formData = Object.values(payload.form)
  // remove anything thats not an object with a fileId key
  const filteredFormData = formData.filter(data => typeof data === 'object' && data?.fileId)

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
        publishedAt: null
      }
    }
  })
}

const getMetadataBySbi = async (sbi) => {
  const collection = config.get(metadataCollection)

  const documents = await db.collection(collection)
    .find({ 'metadata.sbi': sbi })
    .project({ metadata: 1, file: 1 }) // only return the metadata and file keys
    .toArray()

  if (documents.length === 0) {
    throw new NotFoundError('No documents found')
  }

  return documents
}

const persistMetadata = async (documents, session) => {
  const collection = config.get(metadataCollection)

  // TODO check for idempotency needed
  const result = await db.collection(collection).insertMany(documents, { session })

  if (!result.acknowledged) {
    throw new Error('Failed to insert, no acknowledgement from database')
  }

  return result
}

export {
  getMetadataBySbi,
  persistMetadata,
  formatInboundMetadata,
  getS3ReferenceByFileId
}
