import { config } from '../config/index.js'
import { db } from '../data/db.js'

const sessionsCollection = 'mongo.collections.sessions'

const insertSession = async ({ uploadId, metadata, timestamp }) => {
  const collection = config.get(sessionsCollection)

  const result = await db.collection(collection).insertOne({ uploadId, metadata, timestamp })

  if (!result.acknowledged) {
    throw new Error('Failed to insert session record')
  }

  return result
}

export { insertSession }
