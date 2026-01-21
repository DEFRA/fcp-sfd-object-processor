import { ObjectId } from 'mongodb'
import { config } from '../config/index.js'
import { PENDING } from '../constants/outbox.js'
import { db } from '../data/db.js'

const outboxCollection = 'mongo.collections.outbox'

const createOutboxEntries = async (ids, documents, session) => {
  const collection = config.get(outboxCollection)

  const outboxDocs = Object.values(ids).map((id, index) => {
    return {
      messageId: id,
      payload: documents[index],
      status: PENDING,
      attempts: 0,
      createdAt: new Date()
    }
  })

  const { acknowledged, insertedIds } = await db.collection(collection).insertMany(outboxDocs, { session })
  if (!acknowledged) {
    throw new Error('Failed to insert outbox entries')
  }
  return insertedIds
}

const getPendingOutboxEntries = async () => {
  const collection = config.get(outboxCollection)

  const pendingEntries = await db.collection(collection)
    .find({ status: PENDING })
    .toArray()

  return pendingEntries
}

const bulkUpdateDeliveryStatus = async (session, messageIds, status, error = null) => {
  const collection = config.get(outboxCollection)

  const filter = { messageId: { $in: messageIds.map(id => ObjectId.createFromHexString(id)) } }

  const updateDoc = {
    $set: {
      status,
      lastAttemptedAt: new Date(),
      ...(error && { error })
    },
    $inc: {
      attempts: 1
    }
  }
  const updateResult = await db.collection(collection).updateMany(filter, updateDoc, { session })

  if (!updateResult.acknowledged) {
    throw new Error('Failed to update outbox entries')
  }

  return updateResult
}

export {
  createOutboxEntries,
  getPendingOutboxEntries,
  bulkUpdateDeliveryStatus
}
