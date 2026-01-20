import { beforeEach, describe, expect, vi, test } from 'vitest'
import { ObjectId } from 'mongodb'
import { persistMetadataWithOutbox } from '../../../src/services/metadata-service.js'
import { persistMetadata, formatInboundMetadata } from '../../../src/repos/metadata.js'
import { createOutboxEntries } from '../../../src/repos/outbox.js'
import { client } from '../../../src/data/db.js'
import { mockScanAndUploadResponseArray as rawDocuments } from '../../mocks/cdp-uploader.js'
import { mockMetadataResponse as formattedDocuments } from '../../mocks/metadata.js'

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
    test('should start and end a session', async () => {
      formatInboundMetadata.mockReturnValue(formattedDocuments)
      persistMetadata.mockResolvedValue({ insertedIds: {} })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(client.startSession).toHaveBeenCalled()
      expect(mockSession.endSession).toHaveBeenCalled()
    })

    test('should use the transaction when persisting', async () => {
      formatInboundMetadata.mockReturnValue(formattedDocuments)
      persistMetadata.mockResolvedValue({ insertedIds: {} })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(mockSession.withTransaction).toHaveBeenCalled()
    })

    test('should format inbound metadata before persisting', async () => {
      formatInboundMetadata.mockReturnValue(formattedDocuments)
      persistMetadata.mockResolvedValue({ insertedIds: {} })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(formatInboundMetadata).toHaveBeenCalledWith(rawDocuments)
    })

    test('should call persistMetadata with formatted documents and session', async () => {
      formatInboundMetadata.mockReturnValue(formattedDocuments)
      persistMetadata.mockResolvedValue({ insertedIds: {} })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(persistMetadata).toHaveBeenCalledWith(formattedDocuments, mockSession)
    })

    test('should create outbox entries with inserted IDs and formatted documents', async () => {
      const mockMetadataResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: ObjectId.createFromHexString('507f1f77bcf86cd799439011'), 1: ObjectId.createFromHexString('507f1f77bcf86cd799439012') }
      }

      formatInboundMetadata.mockReturnValue(formattedDocuments)
      persistMetadata.mockResolvedValue(mockMetadataResult)

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(createOutboxEntries).toHaveBeenCalledWith(
        mockMetadataResult.insertedIds,
        formattedDocuments,
        mockSession
      )
    })

    test('should return the metadata result', async () => {
      const mockMetadataResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: ObjectId.createFromHexString('507f1f77bcf86cd799439011'), 1: ObjectId.createFromHexString('507f1f77bcf86cd799439012') }
      }

      formatInboundMetadata.mockReturnValue(formattedDocuments)
      persistMetadata.mockResolvedValue(mockMetadataResult)

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      const result = await persistMetadataWithOutbox(rawDocuments)

      expect(result).toEqual(mockMetadataResult)
    })

    test('should throw error and end session if metadata persist fails', async () => {
      const mockError = new Error('Database error')

      persistMetadata.mockRejectedValue(mockError)

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await expect(persistMetadataWithOutbox(rawDocuments)).rejects.toThrow('Database error')

      expect(mockSession.endSession).toHaveBeenCalled()
    })

    test('should throw error and end session if outbox creation fails', async () => {
      const mockMetadataResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: ObjectId.createFromHexString('507f1f77bcf86cd799439011'), 1: ObjectId.createFromHexString('507f1f77bcf86cd799439012') }
      }

      const mockError = new Error('Outbox creation failed')

      persistMetadata.mockResolvedValue(mockMetadataResult)
      createOutboxEntries.mockRejectedValue(mockError)

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await expect(persistMetadataWithOutbox(rawDocuments)).rejects.toThrow('Outbox creation failed')

      expect(mockSession.endSession).toHaveBeenCalled()
    })

    test('should end session even if transaction throws error', async () => {
      const mockError = new Error('Transaction error')

      mockSession.withTransaction.mockRejectedValue(mockError)

      await expect(persistMetadataWithOutbox(rawDocuments)).rejects.toThrow('Transaction error')

      expect(mockSession.endSession).toHaveBeenCalled()
    })
  })
})
