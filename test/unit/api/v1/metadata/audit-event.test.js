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
  getMetadataBySbi: vi.fn()
}))

const { metadataRoute } = await import('../../../../../src/api/v1/metadata/index.js')
const { getMetadataBySbi } = await import('../../../../../src/repos/metadata.js')

const buildMockRequest = (sbi = '105000000') => ({
  params: { sbi },
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

  test('emits document/read for each returned document', async () => {
    const docs = [
      { file: { fileId: 'file-1' }, metadata: { sbi: 105000000 } },
      { file: { fileId: 'file-2' }, metadata: { sbi: 105000000 } }
    ]
    getMetadataBySbi.mockResolvedValueOnce(docs)

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
      })
    )
  })
})
