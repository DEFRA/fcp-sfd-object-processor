import { config } from '../config/index.js'
import { db } from '../data/db.js'

const statusCollection = 'mongo.collections.status'

const insertStatus = async (documents, session = undefined) => {
  const collection = config.get(statusCollection)
  const statusDocuments = Array.isArray(documents) ? documents : [documents]

  const options = session ? { session } : {}
  const result = await db.collection(collection).insertMany(statusDocuments, options)

  if (!result.acknowledged) {
    throw new Error('Failed to insert status records')
  }

  return result
}

const getStatusByCorrelationId = async (correlationId) => {
  const collection = config.get(statusCollection)

  return await db
    .collection(collection)
    .find({ correlationId })
    .project({ _id: 0 })
    .sort({ timestamp: 1 })
    .toArray()
}

export {
  insertStatus,
  getStatusByCorrelationId
}
