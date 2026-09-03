import { MongoClient } from 'mongodb'
import { createSecureContext } from '../api/common/helpers/secure-context/secure-context.js'
import { config } from '../config/index.js'
import { SENT } from '../constants/outbox.js'

import { createLogger } from '../logging/logger.js'

const logger = createLogger()

const client = await MongoClient.connect(config.get('mongo.uri'), {
  retryWrites: false,
  readPreference: config.get('mongo.readPreference'),
  ...(createSecureContext && { secureContext: createSecureContext(logger) })
})

const db = client.db(config.get('mongo.database'))

const createIndexes = async () => {
  const statusCollection = config.get('mongo.collections.status')
  const uploadMetadataCollection = config.get('mongo.collections.uploadMetadata')
  const sessionsCollection = config.get('mongo.collections.sessions')
  const outboxCollection = config.get('mongo.collections.outbox')

  await db.collection(statusCollection).createIndexes([
    { key: { correlationId: 1, timestamp: 1 }, name: 'status_correlationId_timestamp_idx' },
    { key: { sbi: 1 }, name: 'status_sbi_idx' },
    { key: { timestamp: -1 }, name: 'status_timestamp_idx' },
    { key: { sbi: 1, timestamp: -1 }, name: 'status_sbi_timestamp_idx' }
  ])

  await db.collection(uploadMetadataCollection).createIndexes([
    { key: { 'file.fileId': 1 }, name: 'metadata_fileId_idx', unique: true },
    { key: { 'metadata.sbi': 1 }, name: 'metadata_sbi_idx' }
  ])

  await db.collection(sessionsCollection).createIndexes([
    { key: { uploadId: 1 }, name: 'sessions_uploadId_idx', unique: true },
    { key: { timestamp: -1 }, name: 'sessions_timestamp_idx' }
  ])

  const outboxCollectionRef = db.collection(outboxCollection)
  const configuredOutboxSentTtlSeconds = config.get('messaging.outboxSentTtlSeconds')
  // indexes() rejects with NamespaceNotFound when the collection hasn't been created yet.
  const existingOutboxIndexes = await outboxCollectionRef.indexes().catch((error) => {
    if (error.codeName === 'NamespaceNotFound') {
      return []
    }
    throw error
  })
  const outboxSentTtlIndex = existingOutboxIndexes.find(({ name }) => name === 'outbox_sent_ttl_idx')

  if (outboxSentTtlIndex) {
    const specMatches = outboxSentTtlIndex.key?.lastAttemptedAt === 1 &&
      outboxSentTtlIndex.partialFilterExpression?.status === SENT

    if (!specMatches) {
      // Only expireAfterSeconds can be changed in place via collMod; any other
      // change to the key or partial filter requires a drop and recreate.
      await outboxCollectionRef.dropIndex('outbox_sent_ttl_idx')
    } else if (outboxSentTtlIndex.expireAfterSeconds !== configuredOutboxSentTtlSeconds) {
      // collMod updates expireAfterSeconds in place; unlike drop+recreate it is safe
      // for concurrent instances to run and never leaves the collection without the index.
      await db.command({
        collMod: outboxCollection,
        index: { name: 'outbox_sent_ttl_idx', expireAfterSeconds: configuredOutboxSentTtlSeconds }
      })
    }
  }

  await outboxCollectionRef.createIndexes([
    { key: { status: 1, createdAt: 1 }, name: 'outbox_status_createdAt_idx' },
    { key: { status: 1, claimedUntil: 1 }, name: 'outbox_status_claimedUntil_idx' },
    { key: { status: 1, attempts: 1 }, name: 'outbox_status_attempts_idx' },
    { key: { 'payload.file.fileId': 1 }, name: 'outbox_payload_fileId_idx' },
    {
      // Only SENT entries expire; lastAttemptedAt records the successful delivery time.
      key: { lastAttemptedAt: 1 },
      name: 'outbox_sent_ttl_idx',
      expireAfterSeconds: configuredOutboxSentTtlSeconds,
      partialFilterExpression: { status: SENT }
    }
  ])

  logger.info('MongoDB indexes created')
}

await createIndexes()

logger.info('Connected to MongoDB')

export { db, client }
