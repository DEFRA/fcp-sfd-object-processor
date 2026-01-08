import { config } from '../config/index.js'
import { PENDING } from '../constants/outbox.js'
import { db } from '../data/db.js'

const outboxCollection = 'mongo.collections.outbox'

const createOutboxEntries = async (metadataDocumentIds, documents, session) => {
  const collection = config.get(outboxCollection)

  const outboxDocs = Object.entries(metadataDocumentIds).map(([key, id]) => {
    return {
      messageId: id,
      payload: documents[key],
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

export {
  createOutboxEntries
}
