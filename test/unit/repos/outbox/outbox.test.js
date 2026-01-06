import { beforeEach, describe, expect, vi, test } from 'vitest'
import { ObjectId } from 'mongodb'
import { createOutboxEntries, getPendingOutboxEntries, updateDeliveryStatus } from '../../../../src/repos/outbox.js'
import { mockMetadataResponse as documents } from '../../../mocks/metadata.js'
import { PENDING, SENT, FAILED } from '../../../../src/constants/outbox.js'
import { db } from '../../../../src/data/db.js'

vi.mock('../../../../src/data/db.js', () => ({
  db: { collection: vi.fn() },
  client: {}
}))

vi.mock('../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'mongo.collections.outbox') return 'outbox'
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
      updateOne: vi.fn()
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

      const mockResult = {
        acknowledged: true,
        insertedCount: 0,
        insertedIds: {}
      }

      mockCollection.insertMany.mockResolvedValue(mockResult)

      const result = await createOutboxEntries(insertedIds, documents, mockSession)

      expect(mockCollection.insertMany).toHaveBeenCalledWith([], { session: mockSession })
      expect(result).toEqual(mockResult.insertedIds)
    })
  })

  describe('getPendingOutboxEntries', () => {
    test('should retrieve outbox entries with status pending', async () => {
      const mockPendingEntries = [
        { _id: new ObjectId(), status: PENDING, payload: {} },
        { _id: new ObjectId(), status: PENDING, payload: {} }
      ]

      // A cursor is what is returned from mongo find operations
      const mockCursor = {
        toArray: vi.fn().mockResolvedValue(mockPendingEntries)
      }

      mockCollection.find.mockReturnValue(mockCursor)

      const result = await getPendingOutboxEntries()

      expect(db.collection).toHaveBeenCalledWith('outbox')
      expect(mockCollection.find).toHaveBeenCalledWith({ status: PENDING })
      expect(mockCursor.toArray).toHaveBeenCalled()
      expect(result).toEqual(mockPendingEntries)
    })

    test('should return empty array when no pending entries found', async () => {
      // A cursor is what is returned from mongo find operations
      const mockCursor = {
        toArray: vi.fn().mockResolvedValue([])
      }

      mockCollection.find.mockReturnValue(mockCursor)

      const result = await getPendingOutboxEntries()

      expect(db.collection).toHaveBeenCalledWith('outbox')
      expect(mockCollection.find).toHaveBeenCalledWith({ status: PENDING })
      expect(mockCursor.toArray).toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })

  describe('updateDeliveryStatus', () => {
    test('should update outbox entry status to sent', async () => {
      const mockUpdateOneResult = {
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 1,
        upsertedCount: 1,
        upsertedId: null // null because we are not using upsert only modify in place
      }

      mockCollection.updateOne.mockResolvedValue(mockUpdateOneResult)

      const result = await updateDeliveryStatus(1, SENT)

      // this is the response from the db operation
      const updatedEntry = mockCollection.updateOne.mock.calls[0]

      expect(updatedEntry[1].$set).toMatchObject({
        attempts: {
          $inc: 1,
        },
        status: SENT,
        lastAttemptedAt: expect.any(Date)
      })

      expect(result).toEqual(mockUpdateOneResult)
    })

    test('should include error when outbox entry status to failed', async () => {
      const mockUpdateOneResult = {
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 1,
        upsertedCount: 1,
        upsertedId: null // null because we are not using upsert only modify in place
      }

      mockCollection.updateOne.mockResolvedValue(mockUpdateOneResult)

      const result = await updateDeliveryStatus(1, FAILED, 'Test error message')

      // this is the response from the db operation
      const updatedEntry = mockCollection.updateOne.mock.calls[0]

      expect(updatedEntry[1].$set).toMatchObject({
        attempts: {
          $inc: 1,
        },
        status: FAILED,
        lastAttemptedAt: expect.any(Date),
        error: 'Test error message'
      })

      expect(result).toEqual(mockUpdateOneResult)
    })

    test('should throw error when database update fails', async () => {
      mockCollection.updateOne.mockResolvedValue({ acknowledged: false })

      await expect(updateDeliveryStatus(1, SENT))
        .rejects.toThrow('Failed to update outbox entries')
    })
  })
})
