import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  db: vi.fn(),
  collection: vi.fn(),
  createIndexes: vi.fn(),
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

    mocks.collection.mockReturnValue({ createIndexes: mocks.createIndexes })
    mocks.db.mockReturnValue({ collection: mocks.collection })
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
