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

const getSessionByUploadId = async (uploadId) => {
  const collection = config.get(sessionsCollection)

  return db.collection(collection).findOne({ uploadId })
}

export { insertSession, getSessionByUploadId }
