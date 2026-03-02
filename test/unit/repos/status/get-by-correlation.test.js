import { beforeEach, describe, expect, test, vi } from 'vitest'

import { getStatusByCorrelationId } from '../../../../src/repos/status.js'
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

describe('getStatusByCorrelationId', () => {
  let mockCollection
  let mockFind
  let mockProject
  let mockSort
  let mockToArray

  const correlationId = '550e8400-e29b-41d4-a716-446655440000'

  beforeEach(() => {
    vi.clearAllMocks()

    mockToArray = vi.fn()
    mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
    mockProject = vi.fn().mockReturnValue({ sort: mockSort })
    mockFind = vi.fn().mockReturnValue({ project: mockProject })

    mockCollection = {
      find: mockFind
    }

    db.collection.mockReturnValue(mockCollection)
  })

  test('should query the status collection with the correct correlationId', async () => {
    mockToArray.mockResolvedValue([])

    await getStatusByCorrelationId(correlationId)

    expect(db.collection).toHaveBeenCalledWith('status')
    expect(mockFind).toHaveBeenCalledWith({ correlationId })
  })

  test('should sort results by timestamp ascending', async () => {
    mockToArray.mockResolvedValue([])

    await getStatusByCorrelationId(correlationId)

    expect(mockSort).toHaveBeenCalledWith({ timestamp: 1 })
  })

  test('should exclude _id field from results', async () => {
    mockToArray.mockResolvedValue([])

    await getStatusByCorrelationId(correlationId)

    expect(mockProject).toHaveBeenCalledWith({ _id: 0 })
  })

  test('should return array of status documents when records exist', async () => {
    const mockDocuments = [
      {
        correlationId,
        sbi: 105000000,
        fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        timestamp: new Date('2026-02-26T10:00:00Z'),
        validated: true,
        errors: null
      },
      {
        correlationId,
        sbi: 105000000,
        fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554',
        timestamp: new Date('2026-02-26T10:01:00Z'),
        validated: true,
        errors: null
      }
    ]

    mockToArray.mockResolvedValue(mockDocuments)

    const result = await getStatusByCorrelationId(correlationId)

    expect(result).toEqual(mockDocuments)
    expect(result).toHaveLength(2)
  })

  test('should return empty array when no records found', async () => {
    mockToArray.mockResolvedValue([])

    const result = await getStatusByCorrelationId(correlationId)

    expect(result).toEqual([])
  })
})
