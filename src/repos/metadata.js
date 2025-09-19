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

export {
  getMetadataBySbi
}
