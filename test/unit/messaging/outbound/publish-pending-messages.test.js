import { beforeEach, describe, expect, vi, test } from 'vitest'
import { publishPendingMessages } from '../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js'
import { getPendingOutboxEntries, updateDeliveryStatus } from '../../../../src/repos/outbox.js'
import { publishDocumentUploadMessage } from '../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message.js'
import { db, client } from '../../../../src/data/db.js'
import { SENT, FAILED } from '../../../../src/constants/outbox.js'

vi.mock('../../../../src/data/db.js', () => ({
  db: { collection: vi.fn() },
  client: {
    startSession: vi.fn()
  }
}))

vi.mock('../../../../src/repos/outbox.js')
vi.mock('../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message.js')

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
    publishDocumentUploadMessage.mockResolvedValue(undefined)
    updateDeliveryStatus.mockResolvedValue({ modifiedCount: 1 })

    await publishPendingMessages()

    expect(getPendingOutboxEntries).toHaveBeenCalledOnce()
    expect(publishDocumentUploadMessage).toHaveBeenCalledTimes(2)
    expect(publishDocumentUploadMessage).toHaveBeenCalledWith(mockPendingMessages[0].payload)
    expect(publishDocumentUploadMessage).toHaveBeenCalledWith(mockPendingMessages[1].payload)
    expect(updateDeliveryStatus).toHaveBeenCalledTimes(2)
    expect(updateDeliveryStatus).toHaveBeenCalledWith(mockPendingMessages[0]._id, SENT)
    expect(updateDeliveryStatus).toHaveBeenCalledWith(mockPendingMessages[1]._id, SENT)
  })

  test('should handle when there are no pending messages', async () => {
    getPendingOutboxEntries.mockResolvedValue([])

    await publishPendingMessages()

    expect(getPendingOutboxEntries).toHaveBeenCalledOnce()
    expect(publishDocumentUploadMessage).not.toHaveBeenCalled()
    expect(updateDeliveryStatus).not.toHaveBeenCalled()
  })

  test('should update status to FAILED when publishing fails', async () => {
    getPendingOutboxEntries.mockResolvedValue(mockPendingMessages)
    publishDocumentUploadMessage.mockRejectedValue(new Error('Publishing failed'))

    await publishPendingMessages()

    expect(getPendingOutboxEntries).toHaveBeenCalledOnce()
    expect(publishDocumentUploadMessage).toHaveBeenCalledTimes(2)
    expect(updateDeliveryStatus).toHaveBeenCalledTimes(2)
    expect(updateDeliveryStatus).toHaveBeenCalledWith(mockPendingMessages[0]._id, FAILED, 'Publishing failed')
    expect(updateDeliveryStatus).toHaveBeenCalledWith(mockPendingMessages[1]._id, FAILED, 'Publishing failed')
  })

  test('should continue processing other messages if one fails', async () => {
    getPendingOutboxEntries.mockResolvedValue(mockPendingMessages)
    publishDocumentUploadMessage.mockRejectedValueOnce(new Error('Publishing failed')).mockResolvedValueOnce(undefined)

    await publishPendingMessages()

    expect(getPendingOutboxEntries).toHaveBeenCalledOnce()
    expect(publishDocumentUploadMessage).toHaveBeenCalledTimes(2)
    expect(updateDeliveryStatus).toHaveBeenCalledTimes(2)
    expect(updateDeliveryStatus).toHaveBeenCalledWith(mockPendingMessages[0]._id, FAILED, 'Publishing failed')
    expect(updateDeliveryStatus).toHaveBeenCalledWith(mockPendingMessages[1]._id, SENT)
  })

  // test('should use transaction session for database operations', async () => {

  // })

  // test('should end session even if error occurs', async () => {
  //   const mockError = new Error('Database error')
  //   getPendingOutboxEntries.mockRejectedValue(mockError)

  //   await expect(publishPendingMessages()).rejects.toThrow('Database error')

  //   expect(mockSession.endSession).toHaveBeenCalledOnce()
  // })
})
