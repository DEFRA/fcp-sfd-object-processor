import { describe, test, expect, vi, beforeEach } from 'vitest'

const TRACING_HEADER = 'x-cdp-request-id'
const CORRELATION_ID = 'test-correlation-id'
const SBI = '105000000'
const CRN = 1050000000
const PAGE_SIZE = 100
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const HTTP_INTERNAL_SERVER_ERROR = 500
const BROKER_DOWN = 'broker down'
const EMPTY_READ_ENTITY = { entity: 'document', action: 'read' }

const { mockConfigGet, mockLoggerWarn } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    switch (key) {
      case 'baseUrl.v1': return '/api/v1'
      case 'tracing.header': return 'x-cdp-request-id'
      case 'mongo.metadataSbiPageSize': return 100
      case 'mongo.metadataSbiMaxPageSize': return 200
      default: return null
    }
  }),
  mockLoggerWarn: vi.fn()
}))

const mockPublishAuditEvent = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: mockLoggerWarn })
}))

vi.mock('../../../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: mockPublishAuditEvent
}))

vi.mock('../../../../../src/repos/metadata.js', () => ({
  getMetadataPageBySbi: vi.fn()
}))

const { metadataRoute } = await import('../../../../../src/api/v1/metadata/index.js')
const { getMetadataPageBySbi } = await import('../../../../../src/repos/metadata.js')
const { NotFoundError } = await import('../../../../../src/errors/not-found-error.js')

// Overrides are spread last so that an explicit `headers: undefined` removes the headers;
// a default parameter would put them back.
const buildMockRequest = (overrides = {}) => ({
  params: { sbi: SBI },
  query: { pageSize: PAGE_SIZE },
  headers: { [TRACING_HEADER]: CORRELATION_ID },
  info: { remoteAddress: '1.2.3.4' },
  logger: { warn: vi.fn() },
  ...overrides
})

const buildMockH = () => {
  const mockCode = vi.fn().mockReturnThis()
  return { response: vi.fn().mockReturnValue({ code: mockCode }) }
}

const buildDocument = (fileId) => ({
  file: { fileId },
  metadata: { sbi: Number(SBI), crn: CRN, reference: 'user entered reference' }
})

const mockPage = (documents) => {
  getMetadataPageBySbi.mockResolvedValueOnce({ documents, hasMore: false, nextCursor: null })
}

const mockNoDocuments = () => {
  getMetadataPageBySbi.mockRejectedValueOnce(new NotFoundError('No documents found'))
}

const readEntity = (fileId) => ({ entity: 'document', action: 'read', entityid: fileId })

describe('metadata handler: document/read audit event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPublishAuditEvent.mockResolvedValue(undefined)
  })

  test('sends exactly one audit event for a page of several documents', async () => {
    mockPage([buildDocument('file-1'), buildDocument('file-2'), buildDocument('file-3')])

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(mockPublishAuditEvent).toHaveBeenCalledTimes(1)
  })

  test('lists one read entity per returned document, in page order', async () => {
    mockPage([buildDocument('file-3'), buildDocument('file-1'), buildDocument('file-2')])

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    const [event] = mockPublishAuditEvent.mock.calls[0]
    expect(event.audit.entities).toEqual([
      readEntity('file-3'),
      readEntity('file-1'),
      readEntity('file-2')
    ])
  })

  test('sends one event with one entity for a single document', async () => {
    mockPage([buildDocument('file-1')])

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(mockPublishAuditEvent).toHaveBeenCalledTimes(1)
    const [event] = mockPublishAuditEvent.mock.calls[0]
    expect(event.audit.entities).toEqual([readEntity('file-1')])
  })

  test('passes the request so the originating IP can be resolved', async () => {
    mockPage([buildDocument('file-1')])
    const request = buildMockRequest()

    await metadataRoute.handler(request, buildMockH())

    expect(mockPublishAuditEvent).toHaveBeenCalledWith(expect.any(Object), request)
  })

  test('carries the correlation id from the tracing header', async () => {
    mockPage([buildDocument('file-1')])

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    const [event] = mockPublishAuditEvent.mock.calls[0]
    expect(event.correlationid).toBe(CORRELATION_ID)
  })

  test('leaves the correlation id undefined when the request has no headers', async () => {
    mockPage([buildDocument('file-1')])

    await metadataRoute.handler(buildMockRequest({ headers: undefined }), buildMockH())

    const [event] = mockPublishAuditEvent.mock.calls[0]
    expect(event.correlationid).toBeUndefined()
  })

  test('attributes the event to the SBI with a success status', async () => {
    mockPage([buildDocument('file-1')])

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    const [event] = mockPublishAuditEvent.mock.calls[0]
    expect(event.audit.accounts).toEqual({ sbi: SBI })
    expect(event.audit.status).toBe('success')
  })

  test('records the document count and the page size in details', async () => {
    mockPage([buildDocument('file-1'), buildDocument('file-2')])

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    const [event] = mockPublishAuditEvent.mock.calls[0]
    expect(event.audit.details).toEqual({ count: 2, pageSize: PAGE_SIZE })
  })

  test('carries neither the CRN nor any metadata content, although the documents contain both', async () => {
    mockPage([buildDocument('file-1'), buildDocument('file-2')])

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    const [event] = mockPublishAuditEvent.mock.calls[0]
    const serialised = JSON.stringify(event)
    expect(serialised).not.toContain('crn')
    expect(serialised).not.toContain(String(CRN))
    expect(serialised).not.toContain('metadata')
    expect(serialised).not.toContain('user entered reference')
  })

  test('sends one event with a single entity without an entityid when the page is empty', async () => {
    mockPage([])

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(mockPublishAuditEvent).toHaveBeenCalledTimes(1)
    const [event] = mockPublishAuditEvent.mock.calls[0]
    expect(event.audit.entities).toEqual([EMPTY_READ_ENTITY])
    expect(event.audit.entities[0]).not.toHaveProperty('entityid')
    expect(event.audit.accounts).toEqual({ sbi: SBI })
    expect(event.audit.status).toBe('success')
    expect(event.audit.details).toEqual({ count: 0, pageSize: PAGE_SIZE })
  })

  test('still returns 200 with an empty page', async () => {
    mockPage([])
    const h = buildMockH()

    const result = await metadataRoute.handler(buildMockRequest(), h)

    expect(h.response).toHaveBeenCalledWith(expect.objectContaining({ data: [] }))
    expect(result.code).toHaveBeenCalledWith(HTTP_OK)
  })

  test('still returns 200 with an empty page when sendAuditEvent rejects', async () => {
    mockPage([])
    mockPublishAuditEvent.mockRejectedValueOnce(new Error(BROKER_DOWN))
    const h = buildMockH()

    const result = await metadataRoute.handler(buildMockRequest(), h)

    expect(result.code).toHaveBeenCalledWith(HTTP_OK)
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
  })

  test('sends the same empty read event when the SBI has no documents', async () => {
    mockNoDocuments()
    const request = buildMockRequest()

    await metadataRoute.handler(request, buildMockH())

    expect(mockPublishAuditEvent).toHaveBeenCalledTimes(1)
    expect(mockPublishAuditEvent).toHaveBeenCalledWith({
      correlationid: CORRELATION_ID,
      audit: {
        entities: [EMPTY_READ_ENTITY],
        accounts: { sbi: SBI },
        status: 'success',
        details: { count: 0, pageSize: PAGE_SIZE }
      }
    }, request)
  })

  test('still returns 404 when the SBI has no documents', async () => {
    mockNoDocuments()

    const result = await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(result.isBoom).toBe(true)
    expect(result.output.statusCode).toBe(HTTP_NOT_FOUND)
  })

  test('still returns 404 and logs a warning when the SBI has no documents and sendAuditEvent rejects', async () => {
    mockNoDocuments()
    mockPublishAuditEvent.mockRejectedValueOnce(new Error(BROKER_DOWN))

    const result = await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(result.output.statusCode).toBe(HTTP_NOT_FOUND)
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mockLoggerWarn.mock.calls[0])).not.toContain(String(CRN))
  })

  test('sends no audit event when the read fails for any other reason', async () => {
    getMetadataPageBySbi.mockRejectedValueOnce(new Error('database unavailable'))

    const result = await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(result.output.statusCode).toBe(HTTP_INTERNAL_SERVER_ERROR)
    expect(mockPublishAuditEvent).not.toHaveBeenCalled()
  })

  test('still returns 200 with documents when sendAuditEvent rejects', async () => {
    const docs = [buildDocument('file-1')]
    mockPage(docs)
    mockPublishAuditEvent.mockRejectedValueOnce(new Error(BROKER_DOWN))
    const h = buildMockH()

    const result = await metadataRoute.handler(buildMockRequest(), h)

    expect(h.response).toHaveBeenCalledWith(expect.objectContaining({ data: docs }))
    expect(result.code).toHaveBeenCalledWith(HTTP_OK)
  })

  test('logs a warning without document content when sendAuditEvent rejects', async () => {
    mockPage([buildDocument('file-1')])
    mockPublishAuditEvent.mockRejectedValueOnce(new Error(BROKER_DOWN))

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { event: { type: 'audit_publish_failed', outcome: 'failure', reason: BROKER_DOWN } },
      'Failed to send metadata read audit event'
    )
    const serialised = JSON.stringify(mockLoggerWarn.mock.calls[0])
    expect(serialised).not.toContain(String(CRN))
    expect(serialised).not.toContain('file-1')
  })

  test('logs no warning when the audit event is sent', async () => {
    mockPage([buildDocument('file-1')])

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })
})
