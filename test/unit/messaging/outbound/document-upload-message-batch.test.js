import { beforeEach, afterEach, describe, expect, vi, test } from 'vitest'
import { buildDocumentUploadMessageBatch } from '../../../../src/messaging/outbound/crm/doc-upload/document-upload-message-batch.js'

describe('buildDocumentUploadMessageBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('should transform array of pending messages into CloudEvents format when given multiple pending messages', () => {
    const pendingMessages = [
      {
        metadata: { sbi: '123456789' },
        file: { fileId: 'file-1', filename: 'test1.pdf' }
      },
      {
        metadata: { sbi: '123456789' },
        file: { fileId: 'file-2', filename: 'test2.pdf' }
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
      },
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
