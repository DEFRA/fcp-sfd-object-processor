import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  db: vi.fn(),
  collection: vi.fn(),
  createIndexes: vi.fn(),
  indexes: vi.fn(),
  command: vi.fn(),
  dropIndex: vi.fn(),
  configGet: vi.fn(),
  loggerInfo: vi.fn(),
  createSecureContext: vi.fn()
}))

vi.mock('mongodb', () => ({
  MongoClient: {
    connect: mocks.connect
  }
}))

vi.mock('../../../src/config/index.js', () => ({
  config: {
    get: mocks.configGet
  }
}))

vi.mock('../../../src/logging/logger.js', () => ({
  createLogger: () => ({
    info: mocks.loggerInfo
  })
}))

vi.mock('../../../src/api/common/helpers/secure-context/secure-context.js', () => ({
  createSecureContext: mocks.createSecureContext
}))

describe('data/db createIndexes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    mocks.createSecureContext.mockReturnValue(undefined)

    mocks.configGet.mockImplementation((key) => {
      switch (key) {
        case 'mongo.uri': return 'mongodb://localhost:27017'
        case 'mongo.readPreference': return 'primary'
        case 'mongo.database': return 'test-db'
        case 'mongo.collections.status': return 'status'
        case 'mongo.collections.uploadMetadata': return 'uploadMetadata'
        case 'mongo.collections.sessions': return 'sessions'
        case 'mongo.collections.outbox': return 'outbox'
        case 'messaging.outboxSentTtlSeconds': return 604800
        default: return undefined
      }
    })

    mocks.indexes.mockResolvedValue([])
    mocks.command.mockResolvedValue({ ok: 1 })
    mocks.dropIndex.mockResolvedValue({ ok: 1 })
    mocks.collection.mockReturnValue({
      createIndexes: mocks.createIndexes,
      indexes: mocks.indexes,
      dropIndex: mocks.dropIndex
    })
    mocks.db.mockReturnValue({ collection: mocks.collection, command: mocks.command })
    mocks.connect.mockResolvedValue({ db: mocks.db })
  })

  test('creates status, metadata, sessions and outbox indexes on startup', async () => {
    await import('../../../src/data/db.js')

    expect(mocks.collection).toHaveBeenNthCalledWith(1, 'status')
    expect(mocks.collection).toHaveBeenNthCalledWith(2, 'uploadMetadata')
    expect(mocks.collection).toHaveBeenNthCalledWith(3, 'sessions')
    expect(mocks.collection).toHaveBeenNthCalledWith(4, 'outbox')

    expect(mocks.createIndexes).toHaveBeenNthCalledWith(1, [
      { key: { correlationId: 1, timestamp: 1 }, name: 'status_correlationId_timestamp_idx' },
      { key: { sbi: 1 }, name: 'status_sbi_idx' },
      { key: { timestamp: -1 }, name: 'status_timestamp_idx' },
      { key: { sbi: 1, timestamp: -1 }, name: 'status_sbi_timestamp_idx' }
    ])

    expect(mocks.createIndexes).toHaveBeenNthCalledWith(2, [
      { key: { 'file.fileId': 1 }, name: 'metadata_fileId_idx', unique: true },
      { key: { 'metadata.sbi': 1 }, name: 'metadata_sbi_idx' }
    ])

    expect(mocks.createIndexes).toHaveBeenNthCalledWith(3, [
      { key: { uploadId: 1 }, name: 'sessions_uploadId_idx', unique: true },
      { key: { timestamp: -1 }, name: 'sessions_timestamp_idx' }
    ])

    expect(mocks.createIndexes).toHaveBeenNthCalledWith(4, [
      { key: { status: 1, createdAt: 1 }, name: 'outbox_status_createdAt_idx' },
      { key: { status: 1, claimedUntil: 1 }, name: 'outbox_status_claimedUntil_idx' },
      { key: { status: 1, attempts: 1 }, name: 'outbox_status_attempts_idx' },
      { key: { 'payload.file.fileId': 1 }, name: 'outbox_payload_fileId_idx' },
      {
        key: { lastAttemptedAt: 1 },
        name: 'outbox_sent_ttl_idx',
        expireAfterSeconds: 604800,
        partialFilterExpression: { status: 'SENT' }
      }
    ])

    expect(mocks.loggerInfo).toHaveBeenCalledWith('MongoDB indexes created')
    expect(mocks.loggerInfo).toHaveBeenCalledWith('Connected to MongoDB')
  })

  test('uses collMod to update the outbox sent TTL index in place when the configured TTL changes', async () => {
    mocks.indexes.mockResolvedValue([{
      name: 'outbox_sent_ttl_idx',
      key: { lastAttemptedAt: 1 },
      partialFilterExpression: { status: 'SENT' },
      expireAfterSeconds: 86400
    }])

    await import('../../../src/data/db.js')

    expect(mocks.command).toHaveBeenCalledWith({
      collMod: 'outbox',
      index: { name: 'outbox_sent_ttl_idx', expireAfterSeconds: 604800 }
    })
    expect(mocks.dropIndex).not.toHaveBeenCalled()
    expect(mocks.loggerInfo).toHaveBeenCalledWith({
      event: {
        type: 'outbox_ttl_index_updated',
        action: 'collmod_index',
        outcome: 'success',
        reason: 'expireAfterSeconds 86400 -> 604800'
      }
    }, 'Updated outbox sent TTL index retention')
    expect(mocks.createIndexes).toHaveBeenLastCalledWith([
      { key: { status: 1, createdAt: 1 }, name: 'outbox_status_createdAt_idx' },
      { key: { status: 1, claimedUntil: 1 }, name: 'outbox_status_claimedUntil_idx' },
      { key: { status: 1, attempts: 1 }, name: 'outbox_status_attempts_idx' },
      { key: { 'payload.file.fileId': 1 }, name: 'outbox_payload_fileId_idx' },
      {
        key: { lastAttemptedAt: 1 },
        name: 'outbox_sent_ttl_idx',
        expireAfterSeconds: 604800,
        partialFilterExpression: { status: 'SENT' }
      }
    ])
  })

  test('creates the outbox sent TTL index when the collection does not exist yet', async () => {
    const notFoundError = new Error('ns does not exist: test-db.outbox')
    notFoundError.codeName = 'NamespaceNotFound'
    mocks.indexes.mockRejectedValue(notFoundError)

    await import('../../../src/data/db.js')

    expect(mocks.command).not.toHaveBeenCalled()
    expect(mocks.createIndexes).toHaveBeenLastCalledWith([
      { key: { status: 1, createdAt: 1 }, name: 'outbox_status_createdAt_idx' },
      { key: { status: 1, claimedUntil: 1 }, name: 'outbox_status_claimedUntil_idx' },
      { key: { status: 1, attempts: 1 }, name: 'outbox_status_attempts_idx' },
      { key: { 'payload.file.fileId': 1 }, name: 'outbox_payload_fileId_idx' },
      {
        key: { lastAttemptedAt: 1 },
        name: 'outbox_sent_ttl_idx',
        expireAfterSeconds: 604800,
        partialFilterExpression: { status: 'SENT' }
      }
    ])
  })

  test('does not call collMod when the outbox sent TTL index already matches configuration', async () => {
    mocks.indexes.mockResolvedValue([{
      name: 'outbox_sent_ttl_idx',
      key: { lastAttemptedAt: 1 },
      partialFilterExpression: { status: 'SENT' },
      expireAfterSeconds: 604800
    }])

    await import('../../../src/data/db.js')

    expect(mocks.command).not.toHaveBeenCalled()
    expect(mocks.dropIndex).not.toHaveBeenCalled()
  })

  test('drops and recreates the outbox sent TTL index when its key or partial filter no longer matches', async () => {
    mocks.indexes.mockResolvedValue([{
      name: 'outbox_sent_ttl_idx',
      key: { createdAt: 1 },
      partialFilterExpression: { status: 'SENT' },
      expireAfterSeconds: 604800
    }])

    await import('../../../src/data/db.js')

    expect(mocks.dropIndex).toHaveBeenCalledWith('outbox_sent_ttl_idx')
    expect(mocks.command).not.toHaveBeenCalled()
    expect(mocks.loggerInfo).toHaveBeenCalledWith({
      event: {
        type: 'outbox_ttl_index_updated',
        action: 'drop_index',
        outcome: 'success',
        reason: 'outbox_sent_ttl_idx key or partialFilterExpression no longer matches configuration'
      }
    }, 'Dropped outbox sent TTL index for recreation')
    expect(mocks.createIndexes).toHaveBeenLastCalledWith([
      { key: { status: 1, createdAt: 1 }, name: 'outbox_status_createdAt_idx' },
      { key: { status: 1, claimedUntil: 1 }, name: 'outbox_status_claimedUntil_idx' },
      { key: { status: 1, attempts: 1 }, name: 'outbox_status_attempts_idx' },
      { key: { 'payload.file.fileId': 1 }, name: 'outbox_payload_fileId_idx' },
      {
        key: { lastAttemptedAt: 1 },
        name: 'outbox_sent_ttl_idx',
        expireAfterSeconds: 604800,
        partialFilterExpression: { status: 'SENT' }
      }
    ])
  })

  test('rethrows unexpected errors from indexes() instead of treating them as no indexes', async () => {
    const authError = new Error('not authorized on test-db to execute command')
    authError.codeName = 'Unauthorized'
    mocks.indexes.mockRejectedValue(authError)

    await expect(import('../../../src/data/db.js')).rejects.toThrow(authError)
    expect(mocks.command).not.toHaveBeenCalled()
  })

  test('exports the connected client and db instance', async () => {
    const mockDbInstance = { collection: mocks.collection }
    const mockClientInstance = { db: mocks.db }
    mocks.db.mockReturnValue(mockDbInstance)
    mocks.connect.mockResolvedValue(mockClientInstance)

    const { db, client } = await import('../../../src/data/db.js')

    expect(client).toBe(mockClientInstance)
    expect(db).toBe(mockDbInstance)
  })

  test('passes a secure context when createSecureContext returns one', async () => {
    const secureContext = { context: true }
    mocks.createSecureContext.mockReturnValue(secureContext)

    await import('../../../src/data/db.js')

    expect(mocks.connect).toHaveBeenCalledWith('mongodb://localhost:27017', {
      retryWrites: false,
      readPreference: 'primary',
      secureContext
    })
  })

  test('omits secureContext when createSecureContext returns undefined', async () => {
    mocks.createSecureContext.mockReturnValue(undefined)

    await import('../../../src/data/db.js')

    expect(mocks.connect).toHaveBeenCalledWith('mongodb://localhost:27017', {
      retryWrites: false,
      readPreference: 'primary'
    })
  })
})
