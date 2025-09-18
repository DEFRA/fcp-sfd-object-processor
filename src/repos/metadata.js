import { config } from '../config/index.js'
import db from '../data/db.js'

const getMetadataBySbi = async (sbi) => {
  const collection = config.get('mongo.collections.uploadMetadata')
  // this needs to return an array of all the found documents
  console.log('sbi', sbi)
  console.log('collection', collection)

  const documents = await db.collection(collection).find({ }).toArray()
  // const dbContents = await db.collection(collection).findOne({ 'metadata.sbi': '105000000' })

  console.log('documents', documents)
  // check what happens when there are no documents
  if (!documents) {
    throw new Error('No documents found for sbi')
  }

  return documents
}

export {
  getMetadataBySbi
}
