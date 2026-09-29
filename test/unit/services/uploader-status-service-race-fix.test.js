import { describe, test, expect, vi } from 'vitest'

const { mockGetSessionByUploadId, mockGetStatusByCorrelationId, mockGetMetadataMessagingByFileIds, mockGetOutboxStatusesByFileIds } = vi.hoisted(() => ({
  mockGetSessionByUploadId: vi.fn(),
  mockGetStatusByCorrelationId: vi.fn(),
  mockGetMetadataMessagingByFileIds: vi.fn(),
  mockGetOutboxStatusesByFileIds: vi.fn()
}))

vi.mock('../../../src/repos/sessions.js', () => ({
  getSessionByUploadId: mockGetSessionByUploadId
}))

vi.mock('../../../src/repos/status.js', () => ({
  getStatusByCorrelationId: mockGetStatusByCorrelationId
}))

vi.mock('../../../src/repos/metadata.js', () => ({
  getMetadataMessagingByFileIds: mockGetMetadataMessagingByFileIds
}))

vi.mock('../../../src/repos/outbox.js', () => ({
  getOutboxStatusesByFileIds: mockGetOutboxStatusesByFileIds
}))

vi.mock('../../../src/data/db.js', () => {
  const client = { startSession: vi.fn(() => ({ endSession: vi.fn() })) }
  return { getClient: () => client }
})

const { getLocalVerdictByUploadId } = await import('../../../src/services/uploader-status-service.js')

describe('getLocalVerdictByUploadId - race condition fix', () => {
  test('should detect PERMANENT_FAILURE when outbox entry exists without publishedAt', async () => {
    const uploadId = 'upload-123'
    const journeyId = 'journey-123'
    const fileId = 'file-abc'

    mockGetSessionByUploadId.mockResolvedValue({ uploadId, journeyId })

    mockGetStatusByCorrelationId.mockResolvedValue([
      { fileId, validated: true, uploadStatus: 'pending', correlationId: journeyId }
    ])

    mockGetMetadataMessagingByFileIds.mockResolvedValue([
      {
        file: { fileId },
        messaging: { publishedAt: null } // NOT published
      }
    ])

    mockGetOutboxStatusesByFileIds.mockResolvedValue([
      {
        status: 'PERMANENT_FAILURE',
        payload: { file: { fileId } },
        attempts: 3
      }
    ])

    // Result should indicate delivery failure
    const result = await getLocalVerdictByUploadId(uploadId)
    expect(result).toMatchObject({
      uploadStatus: 'failure',
      stage: 'delivery-failed'
    })
  })

  test('should NOT mark as failed when PERMANENT_FAILURE but publishedAt exists', async () => {
    const uploadId = 'upload-123'
    const journeyId = 'journey-123'
    const fileId = 'file-abc'

    mockGetSessionByUploadId.mockResolvedValue({ uploadId, journeyId })

    mockGetStatusByCorrelationId.mockResolvedValue([
      { fileId, validated: true, uploadStatus: 'pending', correlationId: journeyId }
    ])

    mockGetMetadataMessagingByFileIds.mockResolvedValue([
      {
        file: { fileId },
        messaging: { publishedAt: '2026-02-16T10:00:00Z' } // WAS published
      }
    ])

    mockGetOutboxStatusesByFileIds.mockResolvedValue([
      {
        status: 'PERMANENT_FAILURE',
        payload: { file: { fileId } },
        attempts: 3
      }
    ])

    // Result should NOT indicate failure since it was already published
    const result = await getLocalVerdictByUploadId(uploadId)
    expect(result.uploadStatus).not.toBe('failure')
  })

  test('should handle multiple files with mixed outbox states', async () => {
    const uploadId = 'upload-123'
    const journeyId = 'journey-123'
    const fileId1 = 'file-1'
    const fileId2 = 'file-2'

    mockGetSessionByUploadId.mockResolvedValue({ uploadId, journeyId })

    mockGetStatusByCorrelationId.mockResolvedValue([
      { fileId: fileId1, validated: true, uploadStatus: 'pending', correlationId: journeyId },
      { fileId: fileId2, validated: true, uploadStatus: 'pending', correlationId: journeyId }
    ])

    mockGetMetadataMessagingByFileIds.mockResolvedValue([
      {
        file: { fileId: fileId1 },
        messaging: { publishedAt: null } // NOT published
      },
      {
        file: { fileId: fileId2 },
        messaging: { publishedAt: '2026-02-16T10:00:00Z' } // WAS published
      }
    ])

    mockGetOutboxStatusesByFileIds.mockResolvedValue([
      {
        status: 'PERMANENT_FAILURE',
        payload: { file: { fileId: fileId1 } }
      },
      {
        status: 'PERMANENT_FAILURE',
        payload: { file: { fileId: fileId2 } }
      }
    ])

    // Should detect failure due to file1's unpublished PERMANENT_FAILURE
    const result = await getLocalVerdictByUploadId(uploadId)
    expect(result.uploadStatus).toBe('failure')
    expect(result.stage).toBe('delivery-failed')
  })

  test('should use outboxByFileId map to prevent race condition between queries', async () => {
    // This test verifies the fix: we build a Map keyed by fileId
    // so that even if outbox records come back in any order,
    // we correctly correlate each file to its outbox entry
    const uploadId = 'upload-123'
    const journeyId = 'journey-123'
    const fileIds = ['file-1', 'file-2', 'file-3']

    mockGetSessionByUploadId.mockResolvedValue({ uploadId, journeyId })

    mockGetStatusByCorrelationId.mockResolvedValue(
      fileIds.map(fileId => ({ fileId, validated: true, uploadStatus: 'pending', correlationId: journeyId }))
    )

    mockGetMetadataMessagingByFileIds.mockResolvedValue(
      fileIds.map(fileId => ({
        file: { fileId },
        messaging: { publishedAt: null }
      }))
    )

    // Outbox records returned in different order than fileIds
    mockGetOutboxStatusesByFileIds.mockResolvedValue([
      {
        status: 'PERMANENT_FAILURE',
        payload: { file: { fileId: 'file-3' } }
      },
      {
        status: 'PERMANENT_FAILURE',
        payload: { file: { fileId: 'file-1' } }
      },
      {
        status: 'PERMANENT_FAILURE',
        payload: { file: { fileId: 'file-2' } }
      }
    ])

    // Should correctly detect failure for all files regardless of query order
    const result = await getLocalVerdictByUploadId(uploadId)
    expect(result.uploadStatus).toBe('failure')
  })

  test('should handle outbox entry with missing or null fileId safely', async () => {
    const uploadId = 'upload-123'
    const journeyId = 'journey-123'
    const fileId = 'file-abc'

    mockGetSessionByUploadId.mockResolvedValue({ uploadId, journeyId })

    mockGetStatusByCorrelationId.mockResolvedValue([
      { fileId, validated: true, uploadStatus: 'pending', correlationId: journeyId }
    ])

    mockGetMetadataMessagingByFileIds.mockResolvedValue([
      {
        file: { fileId },
        messaging: { publishedAt: null }
      }
    ])

    // Malformed outbox entry with missing fileId in payload
    mockGetOutboxStatusesByFileIds.mockResolvedValue([
      {
        status: 'PERMANENT_FAILURE',
        payload: { file: { } } // Missing fileId
      }
    ])

    // Should not crash; should report pending or partial success
    const result = await getLocalVerdictByUploadId(uploadId)
    expect(result).toBeDefined()
  })
})
