import { beforeEach, describe, expect, test, vi } from 'vitest'

import { getSessionByJourneyId, getSessionByUploadId, insertSession } from '../../../src/repos/sessions.js'
import { db } from '../../../src/data/db.js'

vi.mock('../../../src/data/db.js', () => ({
  db: { collection: vi.fn() }
}))

vi.mock('../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'mongo.collections.sessions') return 'sessions'
      return null
    })
  }
}))

describe('Sessions Repository', () => {
  let mockCollection

  beforeEach(() => {
    vi.clearAllMocks()
    mockCollection = { insertOne: vi.fn(), findOne: vi.fn() }
    db.collection.mockReturnValue(mockCollection)
  })

  test('inserts a session document with the correct shape', async () => {
    const timestamp = new Date()
    const sessionData = {
      uploadId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      uploadRef: 'a1b2c3d4-e5f6-4789-abcd-ef0123456789',
      metadata: { sbi: 105000000, type: 'CS_Agreement_Evidence' },
      timestamp
    }
    mockCollection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'some-id' })

    const result = await insertSession(sessionData)

    expect(db.collection).toHaveBeenCalledWith('sessions')
    expect(mockCollection.insertOne).toHaveBeenCalledWith(sessionData)
    expect(result.acknowledged).toBe(true)
  })

  test('throws when the insert is not acknowledged', async () => {
    mockCollection.insertOne.mockResolvedValue({ acknowledged: false })

    await expect(
      insertSession({ uploadId: 'test-id', metadata: {}, timestamp: new Date() })
    ).rejects.toThrow('Failed to insert session record')
  })

  test('propagates errors thrown by insertOne', async () => {
    mockCollection.insertOne.mockRejectedValue(new Error('MongoNetworkError'))

    await expect(
      insertSession({ uploadId: 'test-id', metadata: {}, timestamp: new Date() })
    ).rejects.toThrow('MongoNetworkError')
  })

  test('retries once with a freshly minted uploadRef on a duplicate key error', async () => {
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })
    mockCollection.insertOne
      .mockRejectedValueOnce(duplicateKeyError)
      .mockResolvedValueOnce({ acknowledged: true, insertedId: 'retry-id' })

    const sessionData = {
      uploadId: 'test-id',
      uploadRef: 'a1b2c3d4-e5f6-4789-abcd-ef0123456789',
      metadata: {},
      timestamp: new Date()
    }

    const result = await insertSession(sessionData)

    expect(mockCollection.insertOne).toHaveBeenCalledTimes(2)
    const retryCallArgs = mockCollection.insertOne.mock.calls[1][0]
    expect(retryCallArgs.uploadRef).not.toBe(sessionData.uploadRef)
    expect(result.acknowledged).toBe(true)
  })

  test('throws when the retry insert is not acknowledged', async () => {
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })
    mockCollection.insertOne
      .mockRejectedValueOnce(duplicateKeyError)
      .mockResolvedValueOnce({ acknowledged: false })

    await expect(
      insertSession({ uploadId: 'test-id', uploadRef: 'a1b2c3d4-e5f6-4789-abcd-ef0123456789', metadata: {}, timestamp: new Date() })
    ).rejects.toThrow('Failed to insert session record')
  })

  test('propagates a non-duplicate-key error without retrying', async () => {
    const otherError = Object.assign(new Error('MongoNetworkError'), { code: 89 })
    mockCollection.insertOne.mockRejectedValue(otherError)

    await expect(
      insertSession({ uploadId: 'test-id', uploadRef: 'a1b2c3d4-e5f6-4789-abcd-ef0123456789', metadata: {}, timestamp: new Date() })
    ).rejects.toThrow('MongoNetworkError')
    expect(mockCollection.insertOne).toHaveBeenCalledTimes(1)
  })
})

describe('getSessionByUploadId', () => {
  let mockCollection

  beforeEach(() => {
    vi.clearAllMocks()
    mockCollection = { findOne: vi.fn() }
    db.collection.mockReturnValue(mockCollection)
  })

  test('queries the sessions collection by uploadId', async () => {
    const session = { uploadId: 'test-id', uploadRef: 'a1b2c3d4-e5f6-4789-abcd-ef0123456789', timestamp: new Date() }
    mockCollection.findOne.mockResolvedValue(session)

    const result = await getSessionByUploadId('test-id')

    expect(db.collection).toHaveBeenCalledWith('sessions')
    expect(mockCollection.findOne).toHaveBeenCalledWith({ uploadId: 'test-id' })
    expect(result).toEqual(session)
  })

  test('returns null when no session is found', async () => {
    mockCollection.findOne.mockResolvedValue(null)

    const result = await getSessionByUploadId('missing-id')

    expect(result).toBeNull()
  })
})

describe('getSessionByJourneyId', () => {
  let mockCollection

  beforeEach(() => {
    vi.clearAllMocks()
    mockCollection = { findOne: vi.fn() }
    db.collection.mockReturnValue(mockCollection)
  })

  test('queries on journeyId and projects only uploadId and metadata', async () => {
    const session = { uploadId: 'upload-1', metadata: { sbi: 105000000 } }
    mockCollection.findOne.mockResolvedValue(session)

    const result = await getSessionByJourneyId('550e8400-e29b-41d4-a716-446655440000')

    expect(db.collection).toHaveBeenCalledWith('sessions')
    expect(mockCollection.findOne).toHaveBeenCalledWith(
      { journeyId: '550e8400-e29b-41d4-a716-446655440000' },
      { projection: { uploadId: 1, metadata: 1 } }
    )
    expect(result).toBe(session)
  })

  test('returns null when no session matches', async () => {
    mockCollection.findOne.mockResolvedValue(null)

    await expect(getSessionByJourneyId('missing')).resolves.toBeNull()
  })

  test('propagates errors thrown by findOne', async () => {
    mockCollection.findOne.mockRejectedValue(new Error('MongoNetworkError'))

    await expect(getSessionByJourneyId('any')).rejects.toThrow('MongoNetworkError')
  })
})
