import { ObjectId } from 'mongodb'
import { vi, describe, test, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { config } from '../../../../src/config/index.js'
import { db } from '../../../../src/data/db.js'
import { PENDING, SENT, FAILED } from '../../../../src/constants/outbox.js'
import { publishPendingMessages } from '../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js'
import { mockPendingMessages } from '../../../mocks/outbox.js'
import { publishBatch } from '../../../../src/messaging/sns/publish-batch.js'

// Mock the SNS publish-batch to avoid actual AWS calls
vi.mock('../../../../src/messaging/sns/publish-batch.js')

let originalOutboxCollection
let outboxCollection
let originalMetadataCollection
let metadataCollection

beforeAll(async () => {
  vi.restoreAllMocks()
  // Set unique collections for this test to avoid conflicts
  originalOutboxCollection = config.get('mongo.collections.outbox')
  config.set('mongo.collections.outbox', 'outbox-test-collection')
  outboxCollection = config.get('mongo.collections.outbox')

  originalMetadataCollection = config.get('mongo.collections.uploadMetadata')
  config.set('mongo.collections.uploadMetadata', 'metadata-test-collection')
  metadataCollection = config.get('mongo.collections.uploadMetadata')

  await db.collection(outboxCollection).deleteMany({})
  await db.collection(metadataCollection).deleteMany({})
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(async () => {
  await db.collection(outboxCollection).deleteMany({})
  await db.collection(metadataCollection).deleteMany({})
})

afterAll(async () => {
  // Cleanup: restore original collection names
  vi.restoreAllMocks()
  config.set('mongo.collections.outbox', originalOutboxCollection)
  config.set('mongo.collections.uploadMetadata', originalMetadataCollection)
})

describe('Outbox message processing', () => {
  test('should update outbox status to SENT and metadata publishedAt when messages are successfully published', async () => {
    // Arrange: Create ObjectIds that will link outbox and metadata entries
    const metadataId1 = ObjectId.createFromHexString('507f1f77bcf86cd799439011')
    const metadataId2 = ObjectId.createFromHexString('507f1f77bcf86cd799439012')

    // Create metadata entries
    const metadataEntries = [
      {
        _id: metadataId1,
        metadata: mockPendingMessages[0].payload.metadata,
        file: { fileId: 'file-1', filename: 'test1.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-1', bucket: 'test-bucket' },
        messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
      },
      {
        _id: metadataId2,
        metadata: mockPendingMessages[1].payload.metadata,
        file: { fileId: 'file-2', filename: 'test2.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-2', bucket: 'test-bucket' },
        messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
      }
    ]

    await db.collection(metadataCollection).insertMany(metadataEntries)

    // Create outbox entries with messageId matching metadata _id
    const testMessages = [
      {
        messageId: metadataId1,
        payload: {
          metadata: mockPendingMessages[0].payload.metadata,
          file: { fileId: 'file-1', filename: 'test1.pdf' },
          messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
        },
        status: PENDING,
        attempts: 0,
        createdAt: new Date()
      },
      {
        messageId: metadataId2,
        payload: {
          metadata: mockPendingMessages[1].payload.metadata,
          file: { fileId: 'file-2', filename: 'test2.pdf' },
          messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
        },
        status: PENDING,
        attempts: 0,
        createdAt: new Date()
      }
    ]

    const insertResult = await db.collection(outboxCollection).insertMany(testMessages)
    const insertedIds = Object.values(insertResult.insertedIds)

    // Mock SNS publishBatch to return successful response
    publishBatch.mockResolvedValue({
      Successful: insertedIds.map((id, index) => ({
        Id: testMessages[index].payload.file.fileId,
        MessageId: `sns-message-${index}`,
        SequenceNumber: String(index)
      })),
      Failed: []
    })

    // Act: Run the publishPendingMessages function
    await publishPendingMessages()

    // Assert: Verify outbox entries are updated to SENT
    const updatedMessages = await db.collection(outboxCollection)
      .find({ _id: { $in: insertedIds } })
      .toArray()

    expect(updatedMessages).toHaveLength(2)
    updatedMessages.forEach(msg => {
      expect(msg.status).toBe(SENT)
      expect(msg.attempts).toBe(1)
      expect(msg.lastAttemptedAt).toBeInstanceOf(Date)
    })

    // Assert: Verify metadata entries have publishedAt updated
    const updatedMetadata = await db.collection(metadataCollection)
      .find({ _id: { $in: [metadataId1, metadataId2] } })
      .toArray()

    expect(updatedMetadata).toHaveLength(2)
    updatedMetadata.forEach(doc => {
      expect(doc.messaging.publishedAt).toBeInstanceOf(Date)
      expect(doc.messaging.publishedAt).not.toBeNull()
    })

    // Verify publishBatch was called
    expect(publishBatch).toHaveBeenCalledTimes(1)
  })

  test('should update outbox status to FAILED when messages fail to publish and leave metadata publishedAt as null', async () => {
    // Arrange: Create ObjectIds that will link outbox and metadata entries
    const metadataId1 = ObjectId.createFromHexString('507f1f77bcf86cd799439013')
    const metadataId2 = ObjectId.createFromHexString('507f1f77bcf86cd799439014')

    // Create metadata entries
    const metadataEntries = [
      {
        _id: metadataId1,
        metadata: { sbi: '105000003', crn: '1050000003' },
        file: { fileId: 'file-3', filename: 'test3.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-3', bucket: 'test-bucket' },
        messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }

      },
      {
        _id: metadataId2,
        metadata: { sbi: '105000004', crn: '1050000004' },
        file: { fileId: 'file-4', filename: 'test4.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-4', bucket: 'test-bucket' },
        messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
      }
    ]

    await db.collection(metadataCollection).insertMany(metadataEntries)

    // Create outbox entries with messageId matching metadata _id
    const testMessages = [
      {
        messageId: metadataId1,
        payload: {
          metadata: mockPendingMessages[0].payload.metadata,
          file: { fileId: 'file-3', filename: 'test3.pdf' },
          messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }

        },
        status: PENDING,
        attempts: 0,
        createdAt: new Date()
      },
      {
        messageId: metadataId2,
        payload: {
          metadata: mockPendingMessages[0].payload.metadata,
          file: { fileId: 'file-4', filename: 'test4.pdf' },
          messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }

        },
        status: PENDING,
        attempts: 0,
        createdAt: new Date()
      }
    ]

    const insertResult = await db.collection(outboxCollection).insertMany(testMessages)
    const insertedIds = Object.values(insertResult.insertedIds)

    // Mock SNS publishBatch to return failed response
    publishBatch.mockResolvedValue({
      Successful: [],
      Failed: insertedIds.map((id, index) => ({
        Id: testMessages[index].payload.file.fileId,
        Code: 'InternalError',
        Message: 'SNS publish failed',
        SenderFault: false
      }))
    })

    // Act: Run the publishPendingMessages function
    await publishPendingMessages()

    // Assert: Verify outbox entries are updated to FAILED
    const updatedMessages = await db.collection(outboxCollection)
      .find({ _id: { $in: insertedIds } })
      .toArray()

    expect(updatedMessages).toHaveLength(2)
    updatedMessages.forEach(msg => {
      expect(msg.status).toBe(FAILED)
      expect(msg.attempts).toBe(1)
      expect(msg.lastAttemptedAt).toBeInstanceOf(Date)
      expect(msg.error).toBe('Failed to send message')
    })

    // Assert: Verify metadata entries still have publishedAt as null
    const updatedMetadata = await db.collection(metadataCollection)
      .find({ _id: { $in: [metadataId1, metadataId2] } })
      .toArray()

    expect(updatedMetadata).toHaveLength(2)
    updatedMetadata.forEach(doc => {
      expect(doc.messaging.publishedAt).toBeNull()
    })

    // Verify publishBatch was called
    expect(publishBatch).toHaveBeenCalledTimes(1)
  })

  test('should retrieve and retry FAILED messages alongside PENDING messages', async () => {
  // Arrange: Create mix of PENDING and FAILED entries
    const metadataId1 = ObjectId.createFromHexString('507f1f77bcf86cd799439015')
    const metadataId2 = ObjectId.createFromHexString('507f1f77bcf86cd799439016')

    // Create metadata entries
    const metadataEntries = [
      {
        _id: metadataId1,
        metadata: mockPendingMessages[0].payload.metadata,
        file: { fileId: 'file-1', filename: 'test1.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-1', bucket: 'test-bucket' },
        messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
      },
      {
        _id: metadataId2,
        metadata: mockPendingMessages[1].payload.metadata,
        file: { fileId: 'file-2', filename: 'test2.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-2', bucket: 'test-bucket' },
        messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
      }
    ]

    await db.collection(metadataCollection).insertMany(metadataEntries)

    // Create outbox entries with messageId matching metadata _id
    const testMessages = [
      {
        messageId: metadataId1,
        payload: {
          metadata: mockPendingMessages[0].payload.metadata,
          file: { fileId: 'file-1', filename: 'test1.pdf' },
          messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
        },
        status: FAILED,
        attempts: 1,
        createdAt: new Date()
      },
      {
        messageId: metadataId2,
        payload: {
          metadata: mockPendingMessages[1].payload.metadata,
          file: { fileId: 'file-2', filename: 'test2.pdf' },
          messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
        },
        status: PENDING,
        attempts: 0,
        createdAt: new Date()
      }
    ]

    const insertResult = await db.collection(outboxCollection).insertMany(testMessages)
    const insertedIds = Object.values(insertResult.insertedIds)

    // Mock SNS publishBatch to return successful response
    publishBatch.mockResolvedValue({
      Successful: insertedIds.map((id, index) => ({
        Id: testMessages[index].payload.file.fileId,
        MessageId: `sns-message-${index}`,
        SequenceNumber: String(index)
      })),
      Failed: []
    })

    // Act: Run publishPendingMessages
    await publishPendingMessages()

    // Assert: All PENDING and FAILED messages should be processed
    const updatedMessages = await db.collection(outboxCollection)
      .find({ _id: { $in: insertedIds } })
      .toArray()

    expect(updatedMessages).toHaveLength(2)
    expect(updatedMessages[0].attempts).toBe(2)
    expect(updatedMessages[1].attempts).toBe(1)

    updatedMessages.forEach(msg => {
      expect(msg.status).toBe(SENT)
      expect(msg.lastAttemptedAt).toBeInstanceOf(Date)
    })

    // Assert: Verify metadata entries have publishedAt updated
    const updatedMetadata = await db.collection(metadataCollection)
      .find({ _id: { $in: [metadataId1, metadataId2] } })
      .toArray()

    expect(updatedMetadata).toHaveLength(2)
    updatedMetadata.forEach(doc => {
      expect(doc.messaging.publishedAt).toBeInstanceOf(Date)
      expect(doc.messaging.publishedAt).not.toBeNull()
    })

    // Verify publishBatch was called
    expect(publishBatch).toHaveBeenCalledTimes(1)
  })

  test('should NOT retrieve or process messages with SENT status', async () => {
    // Arrange: Create mix of PENDING and SENT entries
    const metadataId1 = ObjectId.createFromHexString('507f1f77bcf86cd799439015')
    const metadataId2 = ObjectId.createFromHexString('507f1f77bcf86cd799439016')
    const metadataId3 = ObjectId.createFromHexString('507f1f77bcf86cd799439017')

    // Create metadata entries
    const metadataEntries = [
      {
        _id: metadataId1,
        metadata: mockPendingMessages[0].payload.metadata,
        file: { fileId: 'file-1', filename: 'test1.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-1', bucket: 'test-bucket' },
        messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
      },
      {
        _id: metadataId2,
        metadata: mockPendingMessages[1].payload.metadata,
        file: { fileId: 'file-2', filename: 'test2.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-2', bucket: 'test-bucket' },
        messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
      },
      {
        _id: metadataId3,
        metadata: mockPendingMessages[1].payload.metadata,
        file: { fileId: 'file-3', filename: 'test3.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-3', bucket: 'test-bucket' },
        messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
      }
    ]

    await db.collection(metadataCollection).insertMany(metadataEntries)

    // Create outbox entries with messageId matching metadata _id
    const testMessages = [
      {
        messageId: metadataId1,
        payload: {
          metadata: mockPendingMessages[0].payload.metadata,
          file: { fileId: 'file-1', filename: 'test1.pdf' },
          messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
        },
        status: PENDING,
        attempts: 0,
        createdAt: new Date()
      },
      {
        messageId: metadataId2,
        payload: {
          metadata: mockPendingMessages[1].payload.metadata,
          file: { fileId: 'file-2', filename: 'test2.pdf' },
          messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
        },
        status: SENT,
        attempts: 1,
        createdAt: new Date()
      },
      {
        messageId: metadataId3,
        payload: {
          metadata: mockPendingMessages[1].payload.metadata,
          file: { fileId: 'file-3', filename: 'test3.pdf' },
          messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
        },
        status: SENT,
        attempts: 1,
        createdAt: new Date()
      }
    ]

    const insertResult = await db.collection(outboxCollection).insertMany(testMessages)
    const insertedIds = [Object.values(insertResult.insertedIds)[0]] // Only take the first PENDING message ID
    console.log('Inserted Outbox IDs:', insertedIds)

    // Mock SNS publishBatch to return successful response
    publishBatch.mockResolvedValue({
      Successful: insertedIds.map((id, index) => ({
        Id: testMessages[index].payload.file.fileId,
        MessageId: `sns-message-${index}`,
        SequenceNumber: String(index)
      })),
      Failed: []
    })

    // Act: Run publishPendingMessages
    await publishPendingMessages()

    // Assert: All PENDING and FAILED messages should be processed
    const updatedMessages = await db.collection(outboxCollection)
      .find({ _id: { $in: insertedIds } })
      .toArray()

    expect(updatedMessages).toHaveLength(1)
    expect(updatedMessages[0].attempts).toBe(1)

    updatedMessages.forEach(msg => {
      expect(msg.status).toBe(SENT)
      expect(msg.lastAttemptedAt).toBeInstanceOf(Date)
    })

    // Assert: Verify metadata entries have publishedAt updated
    const updatedMetadata = await db.collection(metadataCollection)
      .find({ _id: { $in: [metadataId1] } })
      .toArray()

    expect(updatedMetadata).toHaveLength(1)
    updatedMetadata.forEach(doc => {
      expect(doc.messaging.publishedAt).toBeInstanceOf(Date)
      expect(doc.messaging.publishedAt).not.toBeNull()
    })

    // Verify publishBatch was called
    expect(publishBatch).toHaveBeenCalledTimes(1)
  })

  test('should respect query limit when retrieving PENDING and FAILED messages combined', async () => {
    // Arrange: Set query limit to 3
    const originalQueryLimit = config.get('mongo.outboxQueryLimit')
    config.set('mongo.outboxQueryLimit', 3)

    // Create metadata and outbox entries - 3 PENDING + 3 FAILED = 6 total
    const metadataIds = [
      ObjectId.createFromHexString('507f1f77bcf86cd799439018'),
      ObjectId.createFromHexString('507f1f77bcf86cd799439019'),
      ObjectId.createFromHexString('507f1f77bcf86cd79943901a'),
      ObjectId.createFromHexString('507f1f77bcf86cd79943901b'),
      ObjectId.createFromHexString('507f1f77bcf86cd79943901c'),
      ObjectId.createFromHexString('507f1f77bcf86cd79943901d')
    ]

    // Create metadata entries
    const metadataEntries = metadataIds.map((id, index) => ({
      _id: id,
      metadata: mockPendingMessages[0].payload.metadata,
      file: { fileId: `file-${index}`, filename: `test${index}.pdf`, fileStatus: 'complete' },
      s3: { key: `s3-key-${index}`, bucket: 'test-bucket' },
      messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
    }))

    await db.collection(metadataCollection).insertMany(metadataEntries)

    // Create outbox entries: first 3 are PENDING, last 3 are FAILED
    const testMessages = metadataIds.map((id, index) => ({
      messageId: id,
      payload: {
        metadata: mockPendingMessages[0].payload.metadata,
        file: { fileId: `file-${index}`, filename: `test${index}.pdf` },
        messaging: { publishedAt: null, correlationId: 'mock-correlation-id' }
      },
      status: index < 3 ? PENDING : FAILED,
      attempts: index < 3 ? 0 : 1,
      createdAt: new Date()
    }))

    const insertResult = await db.collection(outboxCollection).insertMany(testMessages)
    const insertedIds = Object.values(insertResult.insertedIds)
    const firstThreeInsertedIds = insertedIds.slice(0, 3) // Only take the first 3 message IDs for assertions

    // Mock SNS publishBatch to return successful response for all messages
    publishBatch.mockResolvedValue({
      Successful: firstThreeInsertedIds.map((id, index) => ({
        Id: testMessages[index].payload.file.fileId,
        MessageId: `sns-message-${index}`,
        SequenceNumber: String(index)
      })),
      Failed: []
    })

    // Act: Run publishPendingMessages
    await publishPendingMessages()

    // Assert: Only 3 messages should have been processed (query limit)
    const processedMessages = await db.collection(outboxCollection)
      .find({ status: SENT })
      .toArray()

    expect(processedMessages).toHaveLength(3)

    // Assert: Remaining 3 messages should still be in their original state
    const unprocessedMessages = await db.collection(outboxCollection)
      .find({ status: { $in: [PENDING, FAILED] }, attempts: { $lte: 1 } })
      .toArray()

    expect(unprocessedMessages).toHaveLength(3)

    // Assert: Verify publishBatch was called only once
    expect(publishBatch).toHaveBeenCalledTimes(1)

    // Cleanup: restore original query limit
    config.set('mongo.outboxQueryLimit', originalQueryLimit)
  })
})
