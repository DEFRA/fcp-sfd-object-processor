import { beforeEach, describe, expect, test, vi } from 'vitest'

import { insertSession } from '../../../../src/repos/sessions.js'
import { db } from '../../../../src/data/db.js'

vi.mock('../../../../src/data/db.js', () => ({
  db: { collection: vi.fn() }
}))

vi.mock('../../../../src/config/index.js', () => ({
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
    mockCollection = { insertOne: vi.fn() }
    db.collection.mockReturnValue(mockCollection)
  })

  test('inserts a session document with the correct shape', async () => {
    const timestamp = new Date()
    const sessionData = {
      uploadId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
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
})
