import { ObjectId } from 'mongodb'

import { beforeEach, afterEach, describe, expect, vi, test } from 'vitest'
import { buildDocumentUploadMessageBatch } from '../../../../src/messaging/outbound/crm/doc-upload/build-document-upload-message-batch.js'

describe('buildDocumentUploadMessageBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const mockPendingMessage = {
    _id: ObjectId('6970ef40eb614141dffe78cb'),
    messageId: ObjectId('6970ef40eb614141dffe78c6'),
    payload: {
      raw: {
        uploadStatus: 'ready',
        numberOfRejectedFiles: 0,
        fileId: '693db079-f82b-4bbc-87e9-86d822cc0bad',
        filename: 'upload-example-5.png',
        contentType: 'image/png',
        fileStatus: 'complete',
        contentLength: 338195,
        checksumSha256: 'WzfoGsFx/lsHpqGG8KGErp+w7+T5MvkDKt5dZlcOqAc=',
        detectedContentType: 'image/png',
        s3Key: 'scanned/85a50fa1-3d1d-46b7-a9eb-b72fc9d97031/693db079-f82b-4bbc-87e9-86d822cc0bad',
        s3Bucket: 'dev-fcp-sfd-object-processor-bucket-c63f2'
      },
      metadata: {
        sbi: '105000000',
        crn: '1050000000',
        frn: '1102658375',
        submissionId: '1733826312',
        uosr: '107220150_1733826312',
        submissionDateTime: '10/12/2024 10:25:12',
        files: ['107220150_1733826312_SBI107220150.pdf'],
        filesInSubmission: 2,
        type: 'CS_Agreement_Evidence',
        reference: 'user entered reference',
        service: 'SFD'
      },
      file: {
        fileId: '693db079-f82b-4bbc-87e9-86d822cc0bad',
        filename: 'upload-example-5.png',
        contentType: 'image/png',
        fileStatus: 'complete'
      },
      s3: {
        key: 'scanned/85a50fa1-3d1d-46b7-a9eb-b72fc9d97031/693db079-f82b-4bbc-87e9-86d822cc0bad',
        bucket: 'dev-fcp-sfd-object-processor-bucket-c63f2'
      },
      messaging: { publishedAt: null },
      _id: ObjectId('6970ef40eb614141dffe78c6')
    },
    status: 'SENT',
    attempts: 1,
    createdAt: '2026-01-21T15:22:40.280Z',
    lastAttemptedAt: '2026-01-21T15:22:59.407Z'
  }

  test('should transform array of pending messages into CloudEvents format when given multiple pending messages', () => {
    const pendingMessages = [
      mockPendingMessage,
      {
        ...mockPendingMessage,
        messageId: { $oid: '696faf5c14ce407432288156' },
      }
    ]

    const result = buildDocumentUploadMessageBatch(pendingMessages)

    expect(result).toHaveLength(2)

    expect(result[0]).toMatchObject({
      id: expect.any(String),
      source: 'fcp-sfd-object-processor',
      specversion: '1.0',
      type: 'uk.gov.fcp.sfd.document.upload.case.create',
      datacontenttype: 'application/json',
      time: expect.any(String),
      data: {
        metadata: { sbi: '123456789' },
        file: { fileId: 'file-1', filename: 'test1.pdf' }
      }
    })

    // Verify UUID format
    expect(result[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

    // Verify ISO 8601 timestamp format
    expect(result[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  test('should transform array of pending messages into CloudEvents format when given single pending message', () => {
    const pendingMessages = [
      {
        metadata: { sbi: '123456789' },
        file: { fileId: 'file-1', filename: 'test1.pdf' }
      }
    ]

    const result = buildDocumentUploadMessageBatch(pendingMessages)

    expect(result).toHaveLength(1)

    expect(result[0]).toMatchObject({
      id: expect.any(String),
      source: 'fcp-sfd-object-processor',
      specversion: '1.0',
      type: 'uk.gov.fcp.sfd.document.upload.case.create',
      datacontenttype: 'application/json',
      time: expect.any(String),
      data: {
        metadata: { sbi: '123456789' },
        file: { fileId: 'file-1', filename: 'test1.pdf' }
      }
    })

    // Verify UUID format
    expect(result[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

    // Verify ISO 8601 timestamp format
    expect(result[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  test('should return empty array when given no pending messages', () => {
    const pendingMessages = []

    const result = buildDocumentUploadMessageBatch(pendingMessages)

    expect(result).toHaveLength(0)
  })
})
