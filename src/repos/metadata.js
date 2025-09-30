import { config } from '../config/index.js'
import { NotFoundError } from '../errors/not-found-error.js'
import db from '../data/db.js'

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
        fileStatus: formUpload.fileStatus,
      },
      s3: {
        key: formUpload.s3Key,
        bucket: formUpload.s3Bucket
      }
    }
  })
}

const getMetadataBySbi = async (sbi) => {
  const collection = config.get('mongo.collections.uploadMetadata')

  const documents = await db.collection(collection).find({ 'metadata.sbi': sbi }).toArray()

  if (documents.length === 0) {
    throw new NotFoundError('No documents found')
  }

  return documents
}

const persistMetadata = async (payload) => {
  const collection = config.get('mongo.collections.uploadMetadata')

  // TODO check for idempotency needed
  const documents = formatInboundMetadata(payload)

  const result = await db.collection(collection).insertMany(documents)

  if (!result.acknowledged) {
    throw new Error('Failed to insert, no acknowledgement from database')
  }
  return result
}

export {
  getMetadataBySbi,
  persistMetadata,
  formatInboundMetadata
}
