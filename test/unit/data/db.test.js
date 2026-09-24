import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  db: vi.fn(),
  collection: vi.fn(),
  createIndexes: vi.fn(),
  indexes: vi.fn(),
  command: vi.fn(),
  dropIndex: vi.fn(),
  configGet: vi.fn(),
  loggerInfo: vi.fn()
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

const importDb = () => import('../../../src/data/db.js')

const connect = async (secureContext) => {
  const dbModule = await importDb()
  await dbModule.connectDb(secureContext)
  return dbModule
}

describe('data/db', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

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
    mocks.connect.mockResolvedValue({ db: mocks.db, close: mocks.close })
  })

  test('creates status, metadata, sessions and outbox indexes on connect', async () => {
    await connect()

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
      { key: { journeyId: 1 }, name: 'sessions_journeyId_idx', unique: true, sparse: true },
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

    await connect()

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
    notFoundError.code = 26
    mocks.indexes.mockRejectedValue(notFoundError)

    await connect()

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

    await connect()

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

    await connect()

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

  test('drops and recreates the outbox sent TTL index when a non-TTL index shares its name', async () => {
    mocks.indexes.mockResolvedValue([{
      name: 'outbox_sent_ttl_idx',
      key: { lastAttemptedAt: 1 },
      partialFilterExpression: { status: 'SENT' }
      // no expireAfterSeconds: this is not actually a TTL index
    }])

    await connect()

    expect(mocks.dropIndex).toHaveBeenCalledWith('outbox_sent_ttl_idx')
    expect(mocks.command).not.toHaveBeenCalled()
  })

  test('rethrows unexpected errors from indexes() and discards the half-initialised connection', async () => {
    const authError = new Error('not authorized on test-db to execute command')
    authError.code = 13
    authError.codeName = 'Unauthorized'
    mocks.indexes.mockRejectedValue(authError)

    const { connectDb, getClient, getDb } = await importDb()

    await expect(connectDb()).rejects.toThrow(authError)
    expect(mocks.command).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledWith(true)
    expect(getClient()).toBeUndefined()
    expect(getDb()).toBeUndefined()
  })

  test('does not connect when the module is imported', async () => {
    const { getClient, getDb } = await importDb()

    expect(mocks.connect).not.toHaveBeenCalled()
    expect(getClient()).toBeUndefined()
    expect(getDb()).toBeUndefined()
  })

  test('getClient and getDb return the connected client and db instance', async () => {
    const mockDbInstance = { collection: mocks.collection, command: mocks.command }
    const mockClientInstance = { db: mocks.db, close: mocks.close }
    mocks.db.mockReturnValue(mockDbInstance)
    mocks.connect.mockResolvedValue(mockClientInstance)

    const { getDb, getClient } = await connect()

    expect(getClient()).toBe(mockClientInstance)
    expect(getDb()).toBe(mockDbInstance)
  })

  test('passes a secure context through to MongoClient.connect when provided', async () => {
    const secureContext = { context: true }

    await connect(secureContext)

    expect(mocks.connect).toHaveBeenCalledWith('mongodb://localhost:27017', {
      retryWrites: false,
      readPreference: 'primary',
      secureContext
    })
  })

  test('omits secureContext when none is provided', async () => {
    await connect()

    expect(mocks.connect).toHaveBeenCalledWith('mongodb://localhost:27017', {
      retryWrites: false,
      readPreference: 'primary'
    })
  })

  test('keeps the existing connection when connectDb is called again', async () => {
    const { connectDb, getClient } = await connect()
    const firstClient = getClient()

    await connectDb({ context: true })

    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(mocks.close).not.toHaveBeenCalled()
    expect(getClient()).toBe(firstClient)
  })

  test('closeDb closes the client and clears the connection', async () => {
    const { closeDb, getClient, getDb } = await connect()

    await closeDb()

    expect(mocks.close).toHaveBeenCalledWith(true)
    expect(getClient()).toBeUndefined()
    expect(getDb()).toBeUndefined()
  })

  test('closeDb does nothing when there is no connection', async () => {
    const { closeDb } = await importDb()

    await expect(closeDb()).resolves.toBeUndefined()
    expect(mocks.close).not.toHaveBeenCalled()
  })

  test('connectDb opens a new connection after closeDb', async () => {
    const { connectDb, closeDb } = await connect()
    await closeDb()

    await connectDb()

    expect(mocks.connect).toHaveBeenCalledTimes(2)
  })
})
