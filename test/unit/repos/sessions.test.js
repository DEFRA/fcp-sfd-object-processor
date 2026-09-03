import { beforeEach, describe, expect, test, vi } from 'vitest'

import { insertSession, getSessionByJourneyId } from '../../../src/repos/sessions.js'
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

let mockCollection

describe('Sessions Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollection = { insertOne: vi.fn(), findOne: vi.fn() }
    db.collection.mockReturnValue(mockCollection)
  })

  test('inserts a session document with the correct shape', async () => {
    const timestamp = new Date()
    const sessionData = {
      uploadId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      journeyId: '550e8400-e29b-41d4-a716-446655440000',
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
      insertSession({ uploadId: 'test-id', journeyId: 'journey-id', metadata: {}, timestamp: new Date() })
    ).rejects.toThrow('Failed to insert session record')
  })

  test('propagates errors thrown by insertOne', async () => {
    mockCollection.insertOne.mockRejectedValue(new Error('MongoNetworkError'))

    await expect(
      insertSession({ uploadId: 'test-id', journeyId: 'journey-id', metadata: {}, timestamp: new Date() })
    ).rejects.toThrow('MongoNetworkError')
  })
})

describe('getSessionByJourneyId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollection = { insertOne: vi.fn(), findOne: vi.fn() }
    db.collection.mockReturnValue(mockCollection)
  })

  test('queries by journeyId with a projection of uploadId and metadata', async () => {
    const sessionDoc = { uploadId: 'upload-1', metadata: { sbi: 105000000, submissionId: 'sub-1' } }
    mockCollection.findOne.mockResolvedValue(sessionDoc)

    const result = await getSessionByJourneyId('550e8400-e29b-41d4-a716-446655440000')

    expect(db.collection).toHaveBeenCalledWith('sessions')
    expect(mockCollection.findOne).toHaveBeenCalledWith(
      { journeyId: '550e8400-e29b-41d4-a716-446655440000' },
      { projection: { uploadId: 1, metadata: 1 } }
    )
    expect(result).toEqual(sessionDoc)
  })

  test('returns null when no session matches the journeyId', async () => {
    mockCollection.findOne.mockResolvedValue(null)

    const result = await getSessionByJourneyId('unknown-journey-id')

    expect(result).toBeNull()
  })
})
