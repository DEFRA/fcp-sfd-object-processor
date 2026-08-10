import { beforeEach, describe, expect, vi, test } from 'vitest'
import { ObjectId } from 'mongodb'

import { createOutboxEntries } from '../../../../src/repos/outbox.js'
import { mockMetadataResponse as documents } from '../../../mocks/metadata.js'
import { PENDING } from '../../../../src/constants/outbox.js'
import { db } from '../../../../src/data/db.js'

vi.mock('../../../../src/data/db.js', () => ({
  db: { collection: vi.fn() },
  client: {}
}))

vi.mock('../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'mongo.collections.outbox') return 'outbox'
      if (key === 'mongo.outboxQueryLimit') return 100
      if (key === 'messaging.outboxMaxAttempts') return 5
      if (key === 'log') return { enabled: false, level: 'info', format: 'pino-pretty', redact: ['req', 'res'] }
      if (key === 'serviceName') return 'test-service'
      if (key === 'serviceVersion') return '0.0.0'
      return null
    })
  }
}))

describe('Outbox Repository', () => {
  let mockCollection
  const mockSession = {}

  beforeEach(() => {
    vi.clearAllMocks()

    mockCollection = {
      insertMany: vi.fn(),
      find: vi.fn(),
      countDocuments: vi.fn(),
      updateMany: vi.fn()
    }

    db.collection.mockReturnValue(mockCollection)
  })

  describe('createOutboxEntries', () => {
    test('should call db.collection with correct collection name', async () => {
      const metadataInsertedIds = { 0: new ObjectId() }

      mockCollection.insertMany.mockResolvedValue({
        acknowledged: true,
        insertedIds: { 0: new ObjectId() }
      })

      await createOutboxEntries(metadataInsertedIds, [documents[0]], mockSession)

      expect(db.collection).toHaveBeenCalledWith('outbox')
    })

    test('should pass session to insertMany operation', async () => {
      const metadataInsertedIds = { 0: new ObjectId() }

      mockCollection.insertMany.mockResolvedValue({
        acknowledged: true,
        insertedIds: { 0: new ObjectId() }
      })

      await createOutboxEntries(metadataInsertedIds, [documents[0]], mockSession)

      expect(mockCollection.insertMany).toHaveBeenCalledWith(
        expect.any(Array),
        { session: mockSession }
      )
    })

    test('should create correct number of outbox entries', async () => {
      const metadataInsertedIds = {
        0: new ObjectId(),
        1: new ObjectId()
      }

      mockCollection.insertMany.mockResolvedValue({
        acknowledged: true,
        insertedIds: { 0: new ObjectId(), 1: new ObjectId() }
      })

      await createOutboxEntries(metadataInsertedIds, documents, mockSession)

      const insertedEntries = mockCollection.insertMany.mock.calls[0][0]
      expect(insertedEntries).toHaveLength(2)
    })

    test('should create outbox entry with correct structure', async () => {
      const messageId = new ObjectId()
      const metadataInsertedIds = { 0: messageId }

      mockCollection.insertMany.mockResolvedValue({
        acknowledged: true,
        insertedIds: { 0: new ObjectId() }
      })

      await createOutboxEntries(metadataInsertedIds, [documents[0]], mockSession)

      const insertedEntry = mockCollection.insertMany.mock.calls[0][0][0]

      expect(insertedEntry).toMatchObject({
        messageId,
        payload: documents[0],
        status: PENDING,
        attempts: 0
      })
      expect(insertedEntry.createdAt).toBeInstanceOf(Date)
    })

    test('should map multiple insertedIds to outbox entries correctly', async () => {
      const metadataInsertedIds = {
        0: new ObjectId(),
        1: new ObjectId()
      }

      mockCollection.insertMany.mockResolvedValue({
        acknowledged: true,
        insertedIds: { 0: new ObjectId(), 1: new ObjectId() }
      })

      await createOutboxEntries(metadataInsertedIds, documents, mockSession)

      const insertedEntries = mockCollection.insertMany.mock.calls[0][0]

      expect(insertedEntries[0]).toMatchObject({
        messageId: metadataInsertedIds[0],
        payload: documents[0],
        status: PENDING,
        attempts: 0
      })

      expect(insertedEntries[1]).toMatchObject({
        messageId: metadataInsertedIds[1],
        payload: documents[1],
        status: PENDING,
        attempts: 0
      })
    })

    test('should return insertedIds from database operation', async () => {
      const metadataInsertedIds = { 0: new ObjectId() }
      const expectedInsertedIds = { 0: new ObjectId() }

      mockCollection.insertMany.mockResolvedValue({
        acknowledged: true,
        insertedIds: expectedInsertedIds
      })

      const result = await createOutboxEntries(metadataInsertedIds, [documents[0]], mockSession)

      expect(result).toEqual(expectedInsertedIds)
    })

    test('should throw error when database insert fails', async () => {
      const insertedIds = { 0: new ObjectId() }

      mockCollection.insertMany.mockResolvedValue({ acknowledged: false })

      await expect(createOutboxEntries(insertedIds, documents, mockSession))
        .rejects.toThrow('Failed to insert outbox entries')
    })

    test('should handle empty insertedIds', async () => {
      const insertedIds = {}
      const documents = []

      const result = await createOutboxEntries(insertedIds, documents, mockSession)

      expect(mockCollection.insertMany).not.toHaveBeenCalled()
      expect(result).toEqual({})
    })

    test('should only create outbox entries for files with status complete', async () => {
      const metadataInsertedIds = {
        0: new ObjectId(),
        1: new ObjectId(),
        2: new ObjectId()
      }

      const documentsWithMixedStatus = [
        { ...documents[0], file: { ...documents[0].file, fileStatus: 'complete' } },
        { ...documents[1], file: { ...documents[1].file, fileStatus: 'rejected' } },
        { ...documents[0], file: { ...documents[0].file, fileStatus: 'pending' } }
      ]

      mockCollection.insertMany.mockResolvedValue({
        acknowledged: true,
        insertedIds: { 0: new ObjectId() }
      })

      await createOutboxEntries(metadataInsertedIds, documentsWithMixedStatus, mockSession)

      const insertedEntries = mockCollection.insertMany.mock.calls[0][0]
      expect(insertedEntries).toHaveLength(1)
      expect(insertedEntries[0].payload.file.fileStatus).toBe('complete')
      expect(insertedEntries[0].messageId).toBe(metadataInsertedIds[0])
    })

    test('should return empty object when no files have complete status', async () => {
      const metadataInsertedIds = {
        0: new ObjectId(),
        1: new ObjectId()
      }

      const documentsWithoutComplete = [
        { ...documents[0], file: { ...documents[0].file, fileStatus: 'rejected' } },
        { ...documents[1], file: { ...documents[1].file, fileStatus: 'pending' } }
      ]

      const result = await createOutboxEntries(metadataInsertedIds, documentsWithoutComplete, mockSession)

      expect(mockCollection.insertMany).not.toHaveBeenCalled()
      expect(result).toEqual({})
    })
  })
})
