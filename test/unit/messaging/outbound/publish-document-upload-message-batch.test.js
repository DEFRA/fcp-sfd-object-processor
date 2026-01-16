import { beforeEach, describe, expect, vi, test } from 'vitest'

import { createLogger } from '../../../../src/logging/logger.js'
import { snsClient } from '../../../../src/messaging/sns/client.js'
import { publishBatch } from '../../../../src/messaging/sns/publish-batch.js'
import { buildDocumentUploadMessageBatch } from '../../../../src/messaging/outbound/crm/doc-upload/document-upload-message-batch.js'
import { publishDocumentUploadMessageBatch } from '../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message-batch.js'

vi.mock('../../../../src/messaging/sns/publish-batch.js')
vi.mock('../../../../src/messaging/outbound/crm/doc-upload/document-upload-message-batch.js')

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

const mockLogger = createLogger()

const mockPendingMessages = [{
  _id: 'message-id-1',
  messageId: 'metadata-id-1',
  payload: {},
  status: 'pending',
}]

const mockMessageBatch = [{
  cloudEventsFormat: 'cloud-events',
}]

describe('Publish Received Message', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should publish a message batch', async () => {
    buildDocumentUploadMessageBatch.mockReturnValue(mockMessageBatch)

    await publishDocumentUploadMessageBatch(mockPendingMessages)

    expect(buildDocumentUploadMessageBatch).toHaveBeenCalledWith(mockPendingMessages)

    expect(publishBatch).toHaveBeenCalledWith(
      snsClient,
      'arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events',
      mockMessageBatch
    )
  })

  test('should log error if publish fails', async () => {
    const mockError = new Error('Publish error')

    publishBatch.mockRejectedValue(mockError)

    await publishDocumentUploadMessageBatch(mockPendingMessages)

    expect(mockLogger.error).toHaveBeenCalledWith(
      mockError,
      'Error publishing document upload event'
    )
  })
})
