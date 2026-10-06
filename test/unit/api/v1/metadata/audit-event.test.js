import { describe, test, expect, vi, beforeEach } from 'vitest'

const { mockConfigGet } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    switch (key) {
      case 'baseUrl.v1': return '/api/v1'
      case 'tracing.header': return 'x-cdp-request-id'
      case 'mongo.metadataSbiPageSize': return 100
      case 'mongo.metadataSbiMaxPageSize': return 200
      default: return null
    }
  })
}))

const mockPublishAuditEvent = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() })
}))

vi.mock('../../../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: mockPublishAuditEvent
}))

vi.mock('../../../../../src/repos/metadata.js', () => ({
  getMetadataPageBySbi: vi.fn()
}))

const { metadataRoute } = await import('../../../../../src/api/v1/metadata/index.js')
const { getMetadataPageBySbi } = await import('../../../../../src/repos/metadata.js')

const buildMockRequest = (sbi = '105000000') => ({
  params: { sbi },
  query: { pageSize: 100 },
  headers: { 'x-cdp-request-id': 'test-correlation-id' },
  info: { remoteAddress: '1.2.3.4' },
  logger: { warn: vi.fn() }
})

const buildMockH = () => {
  const mockCode = vi.fn().mockReturnThis()
  return { response: vi.fn().mockReturnValue({ code: mockCode }) }
}

describe('metadata handler — event 2 (document/read)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPublishAuditEvent.mockResolvedValue(undefined)
  })

  test('emits document/read for each document in the returned page', async () => {
    const docs = [
      { file: { fileId: 'file-1' }, metadata: { sbi: 105000000 } },
      { file: { fileId: 'file-2' }, metadata: { sbi: 105000000 } }
    ]
    getMetadataPageBySbi.mockResolvedValueOnce({ documents: docs, hasMore: false, nextCursor: null })

    const request = buildMockRequest()
    const h = buildMockH()

    await metadataRoute.handler(request, h)

    expect(mockPublishAuditEvent).toHaveBeenCalledTimes(2)
    expect(mockPublishAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationid: 'test-correlation-id',
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'read', entityid: 'file-1' }],
          accounts: { sbi: '105000000' },
          status: 'success'
        })
      }),
      request
    )
  })

  test('still returns 200 with documents when sendAuditEvent rejects', async () => {
    const docs = [{ file: { fileId: 'file-1' }, metadata: { sbi: 105000000 } }]
    getMetadataPageBySbi.mockResolvedValueOnce({ documents: docs, hasMore: false, nextCursor: null })
    mockPublishAuditEvent.mockRejectedValueOnce(new Error('broker down'))

    const request = buildMockRequest()
    const h = buildMockH()

    const result = await metadataRoute.handler(request, h)

    expect(h.response).toHaveBeenCalledWith(expect.objectContaining({ data: docs }))
    expect(result.code).toHaveBeenCalledWith(200)
  })
})
