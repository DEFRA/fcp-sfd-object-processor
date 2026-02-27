import { beforeEach, describe, expect, test, vi } from 'vitest'

import { insertStatus } from '../../../../src/repos/status.js'
import { db } from '../../../../src/data/db.js'

vi.mock('../../../../src/data/db.js', () => ({
  db: { collection: vi.fn() }
}))

vi.mock('../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'mongo.collections.status') return 'status'
      return null
    })
  }
}))

describe('Status Repository', () => {
  let mockCollection
  const mockSession = {}

  beforeEach(() => {
    vi.clearAllMocks()

    mockCollection = {
      insertMany: vi.fn()
    }

    db.collection.mockReturnValue(mockCollection)
  })

  test('should insert status documents with a session', async () => {
    const documents = [
      {
        sbi: 105000000,
        fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        timestamp: new Date(),
        validated: true,
        errors: null
      }
    ]

    const expectedResult = {
      acknowledged: true,
      insertedCount: 1,
      insertedIds: { 0: 'status-id-1' }
    }

    mockCollection.insertMany.mockResolvedValue(expectedResult)

    const result = await insertStatus(documents, mockSession)

    expect(db.collection).toHaveBeenCalledWith('status')
    expect(mockCollection.insertMany).toHaveBeenCalledWith(documents, { session: mockSession })
    expect(result).toEqual(expectedResult)
  })

  test('should support single document input', async () => {
    const document = {
      sbi: 105000000,
      fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      timestamp: new Date(),
      validated: false,
      errors: [{ field: 'metadata.crn', errorType: 'required', receivedValue: null }]
    }

    mockCollection.insertMany.mockResolvedValue({ acknowledged: true, insertedCount: 1, insertedIds: { 0: 'status-id-1' } })

    await insertStatus(document, mockSession)

    expect(mockCollection.insertMany).toHaveBeenCalledWith([document], { session: mockSession })
  })

  test('should throw when insert is not acknowledged', async () => {
    mockCollection.insertMany.mockResolvedValue({ acknowledged: false })

    await expect(insertStatus([], mockSession)).rejects.toThrow('Failed to insert status records')
  })
})
