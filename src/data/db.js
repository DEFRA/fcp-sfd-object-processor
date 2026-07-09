import { MongoClient } from 'mongodb'
import { createSecureContext } from '../api/common/helpers/secure-context/secure-context.js'
import { config } from '../config/index.js'

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

  await db.collection(statusCollection).createIndexes([
    { key: { sbi: 1 }, name: 'status_sbi_idx' },
    { key: { timestamp: -1 }, name: 'status_timestamp_idx' },
    { key: { sbi: 1, timestamp: -1 }, name: 'status_sbi_timestamp_idx' }
  ])

  await db.collection(uploadMetadataCollection).createIndexes([
    { key: { 'file.fileId': 1 }, name: 'metadata_fileId_idx', unique: true }
  ])

  await db.collection(sessionsCollection).createIndexes([
    { key: { uploadId: 1 }, name: 'sessions_uploadId_idx', unique: true },
    { key: { timestamp: -1 }, name: 'sessions_timestamp_idx' }
  ])

  logger.info('MongoDB indexes created')
}

await createIndexes()

logger.info('Connected to MongoDB')

export { db, client }
