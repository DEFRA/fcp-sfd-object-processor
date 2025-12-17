import { beforeEach, describe, expect, vi, test } from 'vitest'

import { createLogger } from '../../../../src/logging/logger.js'
import { snsClient } from '../../../../src/messaging/sns/client.js'
import { publish } from '../../../../src/messaging/sns/publish.js'
import { publishDocumentUploadMessage } from '../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message.js'

vi.mock('../../../../src/messaging/sns/publish.js')

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

const mockLogger = createLogger()

const mockDocumentUploadPayload = {
  id: '12345',
  source: 'fcp-sfd-object-processor',
  specversion: '1.0',
  type: 'uk.gov.fcp.sfd.document.upload.case.create',
  datacontenttype: 'application/json',
  time: new Date().toISOString(),
  data: {
    test: 'data'
  }
}

describe('Publish Received Message', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should publish a received message with RECEIVED if message type is RECEIVED', async () => {
    await publishDocumentUploadMessage(mockDocumentUploadPayload)

    expect(publish).toHaveBeenCalledWith(
      snsClient,
      'arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events',
      expect.objectContaining({
        type: 'uk.gov.fcp.sfd.document.upload.case.create'
      })
    )
  })

  test('should log error if publish fails', async () => {
    const mockError = new Error('Publish error')

    publish.mockRejectedValue(mockError)

    await publishDocumentUploadMessage(mockDocumentUploadPayload)

    expect(mockLogger.error).toHaveBeenCalledWith(
      mockError,
      'Error publishing document upload event'
    )
  })
})
