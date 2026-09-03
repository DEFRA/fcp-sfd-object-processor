import { config } from '../config/index.js'
import { db } from '../data/db.js'

const sessionsCollection = 'mongo.collections.sessions'

const insertSession = async ({ uploadId, journeyId, metadata, timestamp }) => {
  const collection = config.get(sessionsCollection)

  const result = await db.collection(collection).insertOne({ uploadId, journeyId, metadata, timestamp })

  if (!result.acknowledged) {
    throw new Error('Failed to insert session record')
  }

  return result
}

// Used by the callback to verify a caller-supplied journeyId against the session
// persisted at initiate time, before trusting it as the correlation id for this upload.
const getSessionByJourneyId = async (journeyId) => {
  const collection = config.get(sessionsCollection)

  return db.collection(collection)
    .findOne({ journeyId }, { projection: { uploadId: 1, metadata: 1 } })
}

export { insertSession, getSessionByJourneyId }
