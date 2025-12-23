import { beforeEach, describe, expect, vi, test } from 'vitest'
import { ObjectId } from 'mongodb'
import { createOutboxEntries, getPendingOutboxEntries } from '../../../../src/repos/outbox.js'
import { mockMetadataResponse as documents } from '../../../mocks/metadata.js'
import { PENDING } from '../../../../src/constants/outbox.js'
import db from '../../../../src/data/db.js'

vi.mock('../../../../src/data/db.js', () => ({
  default: {
    collection: vi.fn()
  }
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
    test('should create outbox entries from metadata insertedIds', async () => {
      // these are the ids returned from mongo when the metadata documents were created
      const metadataInsertedIds = {
        0: new ObjectId(),
        1: new ObjectId()
      }

      // this is the expected result from the insertMany operation
      const mockResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: new ObjectId(), 1: new ObjectId() }
      }

      // mocking the response from the db
      mockCollection.insertMany.mockResolvedValue(mockResult)

      const result = await createOutboxEntries(metadataInsertedIds, documents)

      expect(db.collection).toHaveBeenCalledWith('outbox')
      expect(mockCollection.insertMany).toHaveBeenCalledTimes(1)

      const insertedEntries = mockCollection.insertMany.mock.calls[0][0]
      expect(insertedEntries).toHaveLength(2)

      // Verify structure of the created document in the db
      expect(insertedEntries[0]).toMatchObject({
        messageId: metadataInsertedIds[0],
        payload: documents[0],
        status: PENDING,
        attempts: 0
      })
      expect(insertedEntries[0]).toHaveProperty('createdAt')
      expect(insertedEntries[0].createdAt).toBeInstanceOf(Date)

      // Verify structure of second entry
      expect(insertedEntries[1]).toMatchObject({
        messageId: metadataInsertedIds[1],
        payload: documents[1],
        status: PENDING,
        attempts: 0
      })

      // this is the result of the createOutboxEntries which is returning the array of insertedIds from the db operation
      expect(result).toEqual(mockResult.insertedIds)
    })

    test('should throw error when database insert fails', async () => {
      const insertedIds = { 0: new ObjectId() }

      mockCollection.insertMany.mockResolvedValue({ acknowledged: false })

      await expect(createOutboxEntries(insertedIds, documents))
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

      const result = await createOutboxEntries(insertedIds, documents)

      expect(mockCollection.insertMany).toHaveBeenCalledWith([])
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
})
