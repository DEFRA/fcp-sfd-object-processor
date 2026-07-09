import { describe, test, expect, vi, beforeEach } from 'vitest'

const { mockConfigGet } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    switch (key) {
      case 'baseUrl.v1': return '/api/v1'
      case 'tracing.header': return 'x-cdp-request-id'
      default: return null
    }
  })
}))

const mockPublishAuditEvent = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

vi.mock('../../../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: mockPublishAuditEvent
}))

vi.mock('../../../../../src/repos/metadata.js', () => ({
  getS3ReferenceByFileId: vi.fn()
}))

vi.mock('../../../../../src/repos/s3.js', () => ({
  generatePresignedUrl: vi.fn()
}))

const { blobRoute } = await import('../../../../../src/api/v1/blobs/index.js')
const { getS3ReferenceByFileId } = await import('../../../../../src/repos/metadata.js')
const { generatePresignedUrl } = await import('../../../../../src/repos/s3.js')

const buildMockRequest = (fileId = 'test-file-id') => ({
  params: { fileId },
  headers: { 'x-cdp-request-id': 'test-correlation-id' },
  info: { remoteAddress: '1.2.3.4' },
  logger: { warn: vi.fn() }
})

const buildMockH = () => {
  const mockCode = vi.fn().mockReturnThis()
  return { response: vi.fn().mockReturnValue({ code: mockCode }) }
}

describe('blob handler — event 3 (document/read)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPublishAuditEvent.mockResolvedValue(undefined)
    getS3ReferenceByFileId.mockResolvedValue({ s3: { key: 'some-key', bucket: 'some-bucket' } })
    generatePresignedUrl.mockResolvedValue({ url: 'https://s3.example.com/presigned' })
  })

  test('emits document/read with fileId after presigned URL is generated', async () => {
    const request = buildMockRequest('test-file-id')
    const h = buildMockH()

    await blobRoute.handler(request, h)

    expect(mockPublishAuditEvent).toHaveBeenCalledTimes(1)
    expect(mockPublishAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationid: 'test-correlation-id',
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'read', entityid: 'test-file-id' }],
          status: 'success'
        })
      }),
      request
    )
  })

  test('does not include presigned URL in audit event', async () => {
    const request = buildMockRequest()
    const h = buildMockH()

    await blobRoute.handler(request, h)

    const callArgs = JSON.stringify(mockPublishAuditEvent.mock.calls[0])
    expect(callArgs).not.toContain('presigned')
    expect(callArgs).not.toContain('s3.example.com')
  })
})
