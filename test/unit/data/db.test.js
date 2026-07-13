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
        default: return undefined
      }
    })

    mocks.collection.mockReturnValue({ createIndexes: mocks.createIndexes })
    mocks.db.mockReturnValue({ collection: mocks.collection })
    mocks.connect.mockResolvedValue({ db: mocks.db })
  })

  test('creates status, metadata and sessions indexes on startup', async () => {
    await import('../../../src/data/db.js')

    expect(mocks.collection).toHaveBeenNthCalledWith(1, 'status')
    expect(mocks.collection).toHaveBeenNthCalledWith(2, 'uploadMetadata')
    expect(mocks.collection).toHaveBeenNthCalledWith(3, 'sessions')

    expect(mocks.createIndexes).toHaveBeenNthCalledWith(1, [
      { key: { sbi: 1 }, name: 'status_sbi_idx' },
      { key: { timestamp: -1 }, name: 'status_timestamp_idx' },
      { key: { sbi: 1, timestamp: -1 }, name: 'status_sbi_timestamp_idx' }
    ])

    expect(mocks.createIndexes).toHaveBeenNthCalledWith(2, [
      { key: { 'file.fileId': 1 }, name: 'metadata_fileId_idx', unique: true }
    ])

    expect(mocks.createIndexes).toHaveBeenNthCalledWith(3, [
      { key: { uploadId: 1 }, name: 'sessions_uploadId_idx', unique: true },
      { key: { timestamp: -1 }, name: 'sessions_timestamp_idx' }
    ])
  })
})
