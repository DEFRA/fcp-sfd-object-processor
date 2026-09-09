import { randomUUID } from 'node:crypto'

import { config } from '../config/index.js'
import { db } from '../data/db.js'

const sessionsCollection = 'mongo.collections.sessions'
const DUPLICATE_KEY_ERROR_CODE = 11000

const insertSession = async ({ uploadId, uploadRef, metadata, timestamp }) => {
  const collection = config.get(sessionsCollection)

  try {
    const result = await db.collection(collection).insertOne({ uploadId, uploadRef, metadata, timestamp })

    if (!result.acknowledged) {
      throw new Error('Failed to insert session record')
    }

    return result
  } catch (err) {
    if (err.code !== DUPLICATE_KEY_ERROR_CODE) {
      throw err
    }

    const result = await db.collection(collection).insertOne({ uploadId, uploadRef: randomUUID(), metadata, timestamp })

    if (!result.acknowledged) {
      throw new Error('Failed to insert session record')
    }

    return result
  }
}

// Used by the callback to verify a caller-supplied journeyId against the session
// persisted at initiate time, before trusting it as the correlation id for this upload.
const getSessionByJourneyId = async (journeyId) => {
  const collection = config.get(sessionsCollection)

  return db.collection(collection)
    .findOne({ journeyId }, { projection: { uploadId: 1, metadata: 1 } })
}

const getSessionByUploadId = async (uploadId) => {
  const collection = config.get(sessionsCollection)

  return db.collection(collection).findOne({ uploadId })
}

export { insertSession, getSessionByJourneyId, getSessionByUploadId }
