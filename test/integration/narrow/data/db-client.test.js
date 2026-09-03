import { describe, test, expect } from 'vitest'
import { db } from '../../../../src/data/db.js'
import { config } from '../../../../src/config/index.js'

describe('Create Mongo client', () => {
  test('should return an instance of database client', async () => {
    expect(db).toBeDefined()
    expect(db.s.namespace.db).toBe('fcp-sfd-object-processor')
    expect(db.databaseName).toBe('fcp-sfd-object-processor')
  })

  test('should have a connected MongoDB client', async () => {
    expect(db.client).toBeDefined()
    expect(db.client.topology.isConnected()).toBe(true)
  })

  test('db client should be able to upload data to collection', async () => {
    const uploadResult = await db.collection('test').insertOne({ test: 'test' })
    expect(uploadResult.acknowledged).toBe(true)
  })

  test('db client should be able to retrieve from collection', async () => {
    const queryResult = await db.collection('test').findOne({ test: 'test' })
    expect(queryResult.test).toBe('test')
  })

  test('status collection should include required indexes', async () => {
    const collectionName = config.get('mongo.collections.status')
    const indexes = await db.collection(collectionName).indexes()
    const indexNames = indexes.map(index => index.name)

    expect(indexNames).toContain('status_correlationId_timestamp_idx')
    expect(indexNames).toContain('status_sbi_idx')
    expect(indexNames).toContain('status_timestamp_idx')
    expect(indexNames).toContain('status_sbi_timestamp_idx')
  })

  test('uploadMetadata collection should include required indexes', async () => {
    const collectionName = config.get('mongo.collections.uploadMetadata')
    const indexes = await db.collection(collectionName).indexes()
    const indexNames = indexes.map(index => index.name)

    expect(indexNames).toContain('metadata_fileId_idx')
    expect(indexNames).toContain('metadata_sbi_idx')
  })

  test('outbox collection should include required indexes', async () => {
    const collectionName = config.get('mongo.collections.outbox')
    const indexes = await db.collection(collectionName).indexes()
    const indexNames = indexes.map(index => index.name)

    expect(indexNames).toContain('outbox_status_createdAt_idx')
    expect(indexNames).toContain('outbox_status_claimedUntil_idx')
    expect(indexNames).toContain('outbox_status_attempts_idx')
    expect(indexNames).toContain('outbox_payload_fileId_idx')
    expect(indexNames).toContain('outbox_sent_ttl_idx')
  })

  test('outbox sent TTL index is configured for SENT entries only', async () => {
    const collectionName = config.get('mongo.collections.outbox')
    const indexes = await db.collection(collectionName).indexes()
    const ttlIndex = indexes.find(index => index.name === 'outbox_sent_ttl_idx')

    expect(ttlIndex.expireAfterSeconds).toBe(config.get('messaging.outboxSentTtlSeconds'))
    expect(ttlIndex.partialFilterExpression).toEqual({ status: 'SENT' })
  })
})
