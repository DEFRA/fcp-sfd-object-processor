import { beforeEach, describe, expect, test, vi } from 'vitest'

import { getStatusByCorrelationId } from '../../../../src/repos/status.js'
import { getDb } from '../../../../src/data/db.js'

const { STATUS_QUERY_LIMIT } = vi.hoisted(() => ({ STATUS_QUERY_LIMIT: 3 }))
const LIMIT_REACHED_EVENT_TYPE = 'status_query_limit_reached'

const db = getDb()

vi.mock('../../../../src/data/db.js', () => {
  const db = { collection: vi.fn() }
  return { getDb: () => db }
})

vi.mock('../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'mongo.collections.status') return 'status'
      if (key === 'mongo.statusQueryLimit') return STATUS_QUERY_LIMIT
      return null
    })
  }
}))

const { mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn()
}))
vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: mockLoggerWarn })
}))

describe('getStatusByCorrelationId', () => {
  let mockCollection
  let mockFind
  let mockProject
  let mockSort
  let mockLimit
  let mockToArray

  const correlationId = '550e8400-e29b-41d4-a716-446655440000'

  const buildStatusRecords = (count) => Array.from({ length: count }, (_, index) => ({
    sbi: 105000000,
    fileId: `file-${index}`,
    timestamp: new Date(Date.UTC(2026, 1, 26, 10, index)),
    validated: true,
    errors: null
  }))

  beforeEach(() => {
    vi.clearAllMocks()

    mockToArray = vi.fn()
    mockLimit = vi.fn().mockReturnValue({ toArray: mockToArray })
    mockSort = vi.fn().mockReturnValue({ limit: mockLimit })
    mockProject = vi.fn().mockReturnValue({ sort: mockSort })
    mockFind = vi.fn().mockReturnValue({ project: mockProject })

    mockCollection = {
      find: mockFind
    }

    db.collection.mockReturnValue(mockCollection)
  })

  test('should query the status collection with the correct correlationId', async () => {
    const mockDocuments = [{ correlationId, sbi: 105000000, fileId: '123', timestamp: new Date(), validated: true, errors: null }]
    mockToArray.mockResolvedValue(mockDocuments)

    await getStatusByCorrelationId(correlationId)

    expect(db.collection).toHaveBeenCalledWith('status')
    expect(mockFind).toHaveBeenCalledWith({ correlationId })
  })

  test('should pass the session to find when a session is supplied', async () => {
    const mockSession = {}
    mockToArray.mockResolvedValue([])

    await getStatusByCorrelationId(correlationId, mockSession)

    expect(mockFind).toHaveBeenCalledWith({ correlationId }, { session: mockSession })
  })

  test('should pass only the filter to find when no session is supplied', async () => {
    mockToArray.mockResolvedValue([])

    await getStatusByCorrelationId(correlationId)

    expect(mockFind).toHaveBeenCalledWith({ correlationId })
    expect(mockFind.mock.calls[0]).toHaveLength(1)
  })

  test('should sort results by timestamp ascending', async () => {
    const mockDocuments = [{ correlationId, sbi: 105000000, fileId: '123', timestamp: new Date(), validated: true, errors: null }]
    mockToArray.mockResolvedValue(mockDocuments)

    await getStatusByCorrelationId(correlationId)

    expect(mockSort).toHaveBeenCalledWith({ timestamp: 1 })
  })

  test('should limit results to the configured status query limit', async () => {
    mockToArray.mockResolvedValue([])

    await getStatusByCorrelationId(correlationId)

    expect(mockLimit).toHaveBeenCalledTimes(1)
    expect(mockLimit).toHaveBeenCalledWith(STATUS_QUERY_LIMIT)
  })

  test('should apply the limit after the ascending timestamp sort', async () => {
    mockToArray.mockResolvedValue([])

    await getStatusByCorrelationId(correlationId)

    expect(mockSort.mock.invocationCallOrder[0]).toBeLessThan(mockLimit.mock.invocationCallOrder[0])
    expect(mockLimit.mock.invocationCallOrder[0]).toBeLessThan(mockToArray.mock.invocationCallOrder[0])
  })

  test('should exclude the _id and correlationId fields from results', async () => {
    const mockDocuments = [{ correlationId, sbi: 105000000, fileId: '123', timestamp: new Date(), validated: true, errors: null }]
    mockToArray.mockResolvedValue(mockDocuments)

    await getStatusByCorrelationId(correlationId)

    expect(mockProject).toHaveBeenCalledWith({ _id: 0, correlationId: 0 })
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

  describe('when the status query limit is reached', () => {
    test('should log one warning when exactly the limit number of records is returned', async () => {
      mockToArray.mockResolvedValue(buildStatusRecords(STATUS_QUERY_LIMIT))

      await getStatusByCorrelationId(correlationId)

      expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        {
          event: {
            type: LIMIT_REACHED_EVENT_TYPE,
            outcome: 'unknown',
            reason: `${STATUS_QUERY_LIMIT} status records returned, equal to the configured limit`
          }
        },
        expect.any(String)
      )
    })

    test('should not log a warning when fewer records than the limit are returned', async () => {
      mockToArray.mockResolvedValue(buildStatusRecords(STATUS_QUERY_LIMIT - 1))

      await getStatusByCorrelationId(correlationId)

      expect(mockLoggerWarn).not.toHaveBeenCalled()
    })

    test('should not log a warning when no records are returned', async () => {
      mockToArray.mockResolvedValue([])

      await getStatusByCorrelationId(correlationId)

      expect(mockLoggerWarn).not.toHaveBeenCalled()
    })

    test('should not include the correlationId or any record content in the warning', async () => {
      const records = buildStatusRecords(STATUS_QUERY_LIMIT)
      mockToArray.mockResolvedValue(records)

      await getStatusByCorrelationId(correlationId)

      const loggedOutput = JSON.stringify(mockLoggerWarn.mock.calls[0])
      expect(loggedOutput).not.toContain(correlationId)
      expect(loggedOutput).not.toContain('105000000')
      for (const record of records) {
        expect(loggedOutput).not.toContain(record.fileId)
        expect(loggedOutput).not.toContain(record.timestamp.toISOString())
      }
      expect(Object.keys(mockLoggerWarn.mock.calls[0][0])).toEqual(['event'])
      expect(Object.keys(mockLoggerWarn.mock.calls[0][0].event).sort()).toEqual(['outcome', 'reason', 'type'])
    })

    // The limit is applied by MongoDB, so records beyond it never reach the caller: neither
    // their validated flag nor their fileId is seen by getLocalVerdictByUploadId. The mock
    // cursor returns whatever it is given, so this asserts on the limit call and the warning.
    test('should return only the records the limited cursor yields and warn that later records were not read', async () => {
      const limitedRecords = buildStatusRecords(STATUS_QUERY_LIMIT)
      mockToArray.mockResolvedValue(limitedRecords)

      const result = await getStatusByCorrelationId(correlationId)

      expect(mockLimit).toHaveBeenCalledWith(STATUS_QUERY_LIMIT)
      expect(result).toEqual(limitedRecords)
      expect(result).toHaveLength(STATUS_QUERY_LIMIT)
      expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
      expect(mockLoggerWarn.mock.calls[0][0].event.type).toBe(LIMIT_REACHED_EVENT_TYPE)
    })
  })
})
