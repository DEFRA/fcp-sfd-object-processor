import { config } from '../config/index.js'
import db from '../data/db.js'

const getMetadataBySbi = async (sbi) => {
  const collection = config.get('mongo.collections.uploadMetadata')

  const documents = await db.collection(collection).find({ 'metadata.sbi': sbi }).toArray()
  // DEBUGGING
  // const dbContents = await db.collection(collection).find({ 'metadata.sbi': '105000000' }).toArray()
  // console.log(dbContents)

  // check what happens when there are no documents
  if (!documents) {
    throw new Error('No documents found for sbi')
  }

  return documents
}

export {
  getMetadataBySbi
}
