import { beforeEach, describe, expect, vi, test } from 'vitest'
import { ObjectId } from 'mongodb'
import { persistMetadataWithOutbox } from '../../../src/services/metadata-service.js'
import { persistMetadata } from '../../../src/repos/metadata.js'
import { createOutboxEntries } from '../../../src/repos/outbox.js'
import { client } from '../../../src/data/db.js'
import { mockMetadataResponse as documents } from '../../mocks/metadata.js'

vi.mock('../../../src/repos/metadata.js')
vi.mock('../../../src/repos/outbox.js')
vi.mock('../../../src/data/db.js', () => ({
  db: { collection: vi.fn() },
  client: {
    startSession: vi.fn()
  }
}))

vi.mock('../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

describe('Metadata Service', () => {
  let mockSession

  beforeEach(() => {
    vi.clearAllMocks()

    mockSession = {
      withTransaction: vi.fn(),
      endSession: vi.fn()
    }

    client.startSession.mockReturnValue(mockSession)
  })

  describe('persistMetadataWithOutbox', () => {
    test('should persist metadata and create outbox entries in a transaction', async () => {
      const mockMetadataResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: new ObjectId(), 1: new ObjectId() }
      }

      const mockOutboxResult = {
        0: new ObjectId(),
        1: new ObjectId()
      }

      persistMetadata.mockResolvedValue(mockMetadataResult)
      createOutboxEntries.mockResolvedValue(mockOutboxResult)

      // Mock withTransaction to execute the callback
      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      const result = await persistMetadataWithOutbox(documents)

      expect(client.startSession).toHaveBeenCalled()
      expect(mockSession.withTransaction).toHaveBeenCalled()
      expect(persistMetadata).toHaveBeenCalledWith(documents, mockSession)
      expect(createOutboxEntries).toHaveBeenCalledWith(
        mockMetadataResult.insertedIds,
        documents,
        mockSession
      )
      expect(mockSession.endSession).toHaveBeenCalled()
      expect(result).toEqual(mockMetadataResult)
    })

    test('should rollback transaction and throw error if metadata persist fails', async () => {
      const mockError = new Error('Database error')

      persistMetadata.mockRejectedValue(mockError)

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await expect(persistMetadataWithOutbox(documents)).rejects.toThrow('Database error')

      expect(mockSession.endSession).toHaveBeenCalled()
    })

    test('should rollback transaction and throw error if outbox creation fails', async () => {
      const mockMetadataResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: new ObjectId(), 1: new ObjectId() }
      }

      const mockError = new Error('Outbox creation failed')

      persistMetadata.mockResolvedValue(mockMetadataResult)
      createOutboxEntries.mockRejectedValue(mockError)

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await expect(persistMetadataWithOutbox(documents)).rejects.toThrow('Outbox creation failed')

      expect(mockSession.endSession).toHaveBeenCalled()
    })

    test('should end session even if transaction throws error', async () => {
      const mockError = new Error('Transaction error')

      mockSession.withTransaction.mockRejectedValue(mockError)

      await expect(persistMetadataWithOutbox(documents)).rejects.toThrow('Transaction error')

      expect(mockSession.endSession).toHaveBeenCalled()
    })
  })
})
