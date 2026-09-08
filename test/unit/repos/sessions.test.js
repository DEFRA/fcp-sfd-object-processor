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
      insertSession({ uploadId: 'test-id', metadata: {}, timestamp: new Date() })
    ).rejects.toThrow('Failed to insert session record')
  })

  test('propagates errors thrown by insertOne', async () => {
    mockCollection.insertOne.mockRejectedValue(new Error('MongoNetworkError'))

    await expect(
      insertSession({ uploadId: 'test-id', metadata: {}, timestamp: new Date() })
    ).rejects.toThrow('MongoNetworkError')
  })

  describe('getSessionByJourneyId', () => {
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
})
