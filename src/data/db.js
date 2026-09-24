import { MongoClient } from 'mongodb'
import { createSecureContext } from '../api/common/helpers/secure-context/secure-context.js'
import { config } from '../config/index.js'
import { SENT } from '../constants/outbox.js'

import { createLogger } from '../logging/logger.js'

const logger = createLogger()

const OUTBOX_SENT_TTL_INDEX_NAME = 'outbox_sent_ttl_idx'

// Holds the current connection. Read it through getClient() and getDb(), which
// always return the connection as it is now rather than as it was at import.
const mongo = {}

const getClient = () => mongo.client

const getDb = () => mongo.db

const createIndexes = async () => {
  const statusCollection = config.get('mongo.collections.status')
  const uploadMetadataCollection = config.get('mongo.collections.uploadMetadata')
  const sessionsCollection = config.get('mongo.collections.sessions')
  const outboxCollection = config.get('mongo.collections.outbox')

  await getDb().collection(statusCollection).createIndexes([
    { key: { correlationId: 1, timestamp: 1 }, name: 'status_correlationId_timestamp_idx' },
    { key: { sbi: 1 }, name: 'status_sbi_idx' },
    { key: { timestamp: -1 }, name: 'status_timestamp_idx' },
    { key: { sbi: 1, timestamp: -1 }, name: 'status_sbi_timestamp_idx' }
  ])

  await getDb().collection(uploadMetadataCollection).createIndexes([
    { key: { 'file.fileId': 1 }, name: 'metadata_fileId_idx', unique: true },
    { key: { 'metadata.sbi': 1 }, name: 'metadata_sbi_idx' }
  ])

  await getDb().collection(sessionsCollection).createIndexes([
    { key: { uploadId: 1 }, name: 'sessions_uploadId_idx', unique: true },
    // sparse, because session records written before this field existed have no journeyId
    // and a non-sparse unique index would collide on those missing values.
    { key: { journeyId: 1 }, name: 'sessions_journeyId_idx', unique: true, sparse: true },
    { key: { timestamp: -1 }, name: 'sessions_timestamp_idx' }
  ])

  const outboxCollectionRef = getDb().collection(outboxCollection)
  const configuredOutboxSentTtlSeconds = config.get('messaging.outboxSentTtlSeconds')
  // indexes() rejects with code 26 (NamespaceNotFound) when the collection hasn't been created yet.
  const existingOutboxIndexes = await outboxCollectionRef.indexes().catch((error) => {
    if (error.code === 26) {
      return []
    }
    throw error
  })
  const outboxSentTtlIndex = existingOutboxIndexes.find(({ name }) => name === OUTBOX_SENT_TTL_INDEX_NAME)

  if (outboxSentTtlIndex) {
    const specMatches = outboxSentTtlIndex.key?.lastAttemptedAt === 1 &&
      outboxSentTtlIndex.partialFilterExpression?.status === SENT &&
      typeof outboxSentTtlIndex.expireAfterSeconds === 'number'

    if (!specMatches) {
      // Only expireAfterSeconds can be changed in place via collMod; any other
      // change to the key or partial filter requires a drop and recreate.
      await outboxCollectionRef.dropIndex(OUTBOX_SENT_TTL_INDEX_NAME)
      logger.info({
        event: {
          type: 'outbox_ttl_index_updated',
          action: 'drop_index',
          outcome: 'success',
          reason: 'outbox_sent_ttl_idx key or partialFilterExpression no longer matches configuration'
        }
      }, 'Dropped outbox sent TTL index for recreation')
    } else if (outboxSentTtlIndex.expireAfterSeconds !== configuredOutboxSentTtlSeconds) {
      // collMod updates expireAfterSeconds in place; unlike drop+recreate it is safe
      // for concurrent instances to run and never leaves the collection without the index.
      await getDb().command({
        collMod: outboxCollection,
        index: { name: OUTBOX_SENT_TTL_INDEX_NAME, expireAfterSeconds: configuredOutboxSentTtlSeconds }
      })
      logger.info({
        event: {
          type: 'outbox_ttl_index_updated',
          action: 'collmod_index',
          outcome: 'success',
          reason: `expireAfterSeconds ${outboxSentTtlIndex.expireAfterSeconds} -> ${configuredOutboxSentTtlSeconds}`
        }
      }, 'Updated outbox sent TTL index retention')
    } else {
      // Index spec and TTL already match configuration; nothing to reconcile.
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
      name: OUTBOX_SENT_TTL_INDEX_NAME,
      expireAfterSeconds: configuredOutboxSentTtlSeconds,
      partialFilterExpression: { status: SENT }
    }
  ])

  logger.info('MongoDB indexes created')
}

const closeDb = async () => {
  const openClient = mongo.client

  mongo.client = undefined
  mongo.db = undefined

  await openClient?.close(true)
}

// Connects once per process. Later calls keep the existing connection, so a
// second caller cannot replace the client that repos and services already use.
const connectDb = async (secureContext) => {
  if (mongo.client) {
    return
  }

  const newClient = await MongoClient.connect(config.get('mongo.uri'), {
    retryWrites: false,
    readPreference: config.get('mongo.readPreference'),
    ...(secureContext && { secureContext })
  })

  mongo.client = newClient
  mongo.db = newClient.db(config.get('mongo.database'))

  try {
    await createIndexes()
  } catch (error) {
    await closeDb()
    throw error
  }

  logger.info('Connected to MongoDB')
}

await connectDb(createSecureContext(logger))

// Bound once at import for modules not yet reading the connection through
// getDb() and getClient(). Remove once no module imports them.
const db = getDb()
const client = getClient()

export { db, client, getDb, getClient, connectDb, closeDb, createIndexes }
