import { config } from '../config/index.js'
import { NotFoundError } from '../errors/not-found-error.js'
import db from '../data/db.js'

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
  // TODO format the payload to include objectURL and filter data

  const result = await db.collection(collection).insertOne({
    uploadStatus: payload.uploadStatus,
    metadata: payload.metadata,
    form: payload.form,
    numberOfRejectedFiles: payload.numberOfRejectedFiles
  })

  if (!result.acknowledged) {
    throw new Error('Failed to insert, no acknowledgement from database')
  }
  return result
}

export {
  getMetadataBySbi,
  persistMetadata
}
