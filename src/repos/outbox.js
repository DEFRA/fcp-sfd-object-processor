import { config } from '../config/index.js'
import { PENDING } from '../constants/outbox.js'
import db from '../data/db.js'

const outboxCollection = 'mongo.collections.outbox'

const createOutboxEntries = async (ids, documents) => {
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

  const { acknowledged, insertedIds } = await db.collection(collection).insertMany(outboxDocs)
  if (!acknowledged) {
    throw new Error('Failed to insert outbox entries')
  }
  return insertedIds
}

export {
  createOutboxEntries
}
