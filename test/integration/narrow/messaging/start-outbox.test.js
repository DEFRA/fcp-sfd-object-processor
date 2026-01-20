import { ObjectId } from 'mongodb'
import { vi, describe, test, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { config } from '../../../../src/config/index.js'
import { db } from '../../../../src/data/db.js'
import { PENDING, SENT, FAILED } from '../../../../src/constants/outbox.js'
import { publishPendingMessages } from '../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js'
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
        metadata: { sbi: '105000001', crn: '1050000001' },
        file: { fileId: 'file-1', filename: 'test1.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-1', bucket: 'test-bucket' },
        messaging: { publishedAt: null }
      },
      {
        _id: metadataId2,
        metadata: { sbi: '105000002', crn: '1050000002' },
        file: { fileId: 'file-2', filename: 'test2.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-2', bucket: 'test-bucket' },
        messaging: { publishedAt: null }
      }
    ]

    await db.collection(metadataCollection).insertMany(metadataEntries)

    // Create outbox entries with messageId matching metadata _id
    const testMessages = [
      {
        messageId: metadataId1,
        payload: {
          metadata: { sbi: '105000001', crn: '1050000001' },
          file: { fileId: 'file-1', filename: 'test1.pdf' }
        },
        status: PENDING,
        attempts: 0,
        createdAt: new Date()
      },
      {
        messageId: metadataId2,
        payload: {
          metadata: { sbi: '105000002', crn: '1050000002' },
          file: { fileId: 'file-2', filename: 'test2.pdf' }
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
        Id: testMessages[index].messageId.toString(),
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
        messaging: { publishedAt: null }
      },
      {
        _id: metadataId2,
        metadata: { sbi: '105000004', crn: '1050000004' },
        file: { fileId: 'file-4', filename: 'test4.pdf', fileStatus: 'complete' },
        s3: { key: 's3-key-4', bucket: 'test-bucket' },
        messaging: { publishedAt: null }
      }
    ]

    await db.collection(metadataCollection).insertMany(metadataEntries)

    // Create outbox entries with messageId matching metadata _id
    const testMessages = [
      {
        messageId: metadataId1,
        payload: {
          metadata: { sbi: '105000003', crn: '1050000003' },
          file: { fileId: 'file-3', filename: 'test3.pdf' }
        },
        status: PENDING,
        attempts: 0,
        createdAt: new Date()
      },
      {
        messageId: metadataId2,
        payload: {
          metadata: { sbi: '105000004', crn: '1050000004' },
          file: { fileId: 'file-4', filename: 'test4.pdf' }
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
        Id: testMessages[index].messageId.toString(),
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
})
