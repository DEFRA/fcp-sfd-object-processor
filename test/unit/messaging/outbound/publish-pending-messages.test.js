import { beforeEach, describe, expect, vi, test } from 'vitest'
import { publishPendingMessages } from '../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js'
import { getPendingOutboxEntries, bulkUpdateDeliveryStatus } from '../../../../src/repos/outbox.js'
import { bulkUpdatePublishedAtDate } from '../../../../src/repos/metadata.js'
import { publishDocumentUploadMessageBatch } from '../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message-batch.js'
import { client } from '../../../../src/data/db.js'
import { SENT, FAILED } from '../../../../src/constants/outbox.js'

vi.mock('../../../../src/data/db.js', () => ({
  db: { collection: vi.fn() },
  client: {
    startSession: vi.fn()
  }
}))

vi.mock('../../../../src/repos/outbox.js')
vi.mock('../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message-batch.js')
vi.mock('../../../../src/repos/metadata.js')
vi.mock('../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'mongo.collections.outbox') return 'outbox'
      if (key === 'aws.messaging.topics.documentUploadEvents') {
        return 'arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events'
      }
      return null
    })
  }
}))

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

describe('publishPendingMessages', () => {
  let mockSession

  const mockPendingMessages = [
    {
      _id: 'message-id-1',
      messageId: 'metadata-id-1',
      payload: {
        metadata: { sbi: '123456789' },
        file: { fileId: 'file-1', filename: 'test1.pdf' }
      },
      status: 'pending',
      attempts: 0,
      createdAt: new Date()
    },
    {
      _id: 'message-id-2',
      messageId: 'metadata-id-2',
      payload: {
        metadata: { sbi: '987654321' },
        file: { fileId: 'file-2', filename: 'test2.pdf' }
      },
      status: 'pending',
      attempts: 0,
      createdAt: new Date()
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    mockSession = {
      withTransaction: vi.fn((callback) => callback()),
      endSession: vi.fn()
    }

    client.startSession.mockReturnValue(mockSession)
  })

  test('should fetch pending messages and publish them', async () => {
    getPendingOutboxEntries.mockResolvedValue(mockPendingMessages)
    publishDocumentUploadMessageBatch.mockResolvedValue({
      Successful: [{ id: 'id-1', messageId: 'message-id-1', sequenceNumber: 1 }],
      Failed: [{ id: 'id-2', messageId: 'message-id-2', sequenceNumber: 2 }]
    })

    await publishPendingMessages()

    expect(getPendingOutboxEntries).toHaveBeenCalledOnce()
  })

  test('should process messages in batches of 10 when more than batch size returned from getPendingOutboxEntries', async () => {
  // Create 25 mock messages
    const largeBatch = Array.from({ length: 25 }, (_, index) => ({
      _id: `message-id-${index}`,
      messageId: `metadata-id-${index}`,
      payload: {
        metadata: { sbi: `${123456789 + index}` },
        file: { fileId: `file-${index}`, filename: `test${index}.pdf` }
      },
      status: 'pending',
      attempts: 0,
      createdAt: new Date()
    }))

    getPendingOutboxEntries.mockResolvedValue(largeBatch)
    publishDocumentUploadMessageBatch.mockResolvedValue({
      Successful: [],
      Failed: []
    })

    await publishPendingMessages()

    expect(getPendingOutboxEntries).toHaveBeenCalledOnce()

    // Should be called 3 times: 10 + 10 + 5
    expect(publishDocumentUploadMessageBatch).toHaveBeenCalledTimes(3)

    // First batch: messages 0-9 (10 messages)
    expect(publishDocumentUploadMessageBatch).toHaveBeenNthCalledWith(1, largeBatch.slice(0, 10))

    // Second batch: messages 10-19 (10 messages)
    expect(publishDocumentUploadMessageBatch).toHaveBeenNthCalledWith(2, largeBatch.slice(10, 20))

    // Third batch: messages 20-24 (5 messages)
    expect(publishDocumentUploadMessageBatch).toHaveBeenNthCalledWith(3, largeBatch.slice(20, 25))
  })

  test('should handle when there are no pending messages', async () => {
    getPendingOutboxEntries.mockResolvedValue([])

    await publishPendingMessages()

    expect(getPendingOutboxEntries).toHaveBeenCalledOnce()
    expect(publishDocumentUploadMessageBatch).not.toHaveBeenCalled()
    expect(bulkUpdateDeliveryStatus).not.toHaveBeenCalled()
    expect(bulkUpdatePublishedAtDate).not.toHaveBeenCalled()
  })

  test('should update status to FAILED when publishDocumentUploadMessageBatch returns Failed messages', async () => {
    getPendingOutboxEntries.mockResolvedValue(mockPendingMessages)
    publishDocumentUploadMessageBatch.mockResolvedValue({
      Successful: [],
      Failed: [{ Id: 'message-id-1', messageId: 'sns-message-id', sequenceNumber: 1 }]
    })
    await publishPendingMessages()

    expect(getPendingOutboxEntries).toHaveBeenCalledOnce()
    expect(publishDocumentUploadMessageBatch).toHaveBeenCalledTimes(1)

    expect(bulkUpdateDeliveryStatus).toHaveBeenCalledTimes(1)
    expect(bulkUpdateDeliveryStatus).toHaveBeenCalledWith(mockSession, ['message-id-1'], FAILED, 'Failed to send message')
    expect(bulkUpdatePublishedAtDate).not.toHaveBeenCalled()
  })

  test('should throw error when publishDocumentUploadMessageBatch fails', async () => {
    getPendingOutboxEntries.mockResolvedValue(mockPendingMessages)
    const publishError = new Error('Publishing failed')
    publishDocumentUploadMessageBatch.mockRejectedValue(publishError)

    await expect(publishPendingMessages()).rejects.toThrow('Publishing failed')

    expect(getPendingOutboxEntries).toHaveBeenCalledOnce()
    expect(publishDocumentUploadMessageBatch).toHaveBeenCalledTimes(1)
    expect(mockSession.endSession).toHaveBeenCalledOnce()
  })

  test('should use transaction session for database operations', async () => {
    getPendingOutboxEntries.mockResolvedValue(mockPendingMessages)
    publishDocumentUploadMessageBatch.mockResolvedValue({
      Successful: [
        { Id: mockPendingMessages[0].messageId }, { Id: mockPendingMessages[1].messageId }
      ],
      Failed: []
    })

    await publishPendingMessages()

    expect(bulkUpdateDeliveryStatus).toHaveBeenCalledWith(mockSession, [mockPendingMessages[0].messageId, mockPendingMessages[1].messageId], SENT)
    expect(bulkUpdatePublishedAtDate).toHaveBeenCalledWith(mockSession, [mockPendingMessages[0].messageId, mockPendingMessages[1].messageId])
  })

  test('should end session even if error occurs', async () => {
    const mockError = new Error('Database error')
    getPendingOutboxEntries.mockRejectedValue(mockError)

    await expect(publishPendingMessages()).rejects.toThrow('Database error')

    expect(mockSession.endSession).toHaveBeenCalledOnce()
  })
})
