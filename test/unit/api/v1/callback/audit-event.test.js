import { describe, test, expect, vi, beforeEach } from 'vitest'

const { mockConfigGet } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    switch (key) {
      case 'baseUrl.v1': return '/api/v1'
      case 'tracing.header': return 'x-cdp-request-id'
      case 'cdpUploaderMimeTypes': return ['application/pdf', 'image/jpeg', 'image/png']
      default: return null
    }
  })
}))

const mockPublishAuditEvent = vi.fn().mockResolvedValue(undefined)

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}

vi.mock('../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

vi.mock('../../../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: mockPublishAuditEvent
}))

vi.mock('../../../../../src/services/metadata-service.js', () => ({
  persistMetadataWithOutbox: vi.fn(),
  persistValidationFailureStatus: vi.fn()
}))

vi.mock('../../../../../src/api/common/helpers/metrics.js', () => ({
  metricsCounter: vi.fn()
}))

vi.mock('../../../../../src/api/v1/callback/validation/validate-callback-payload.js', () => ({
  validateCallbackPayload: vi.fn().mockResolvedValue(null)
}))

vi.mock('../../../../../src/utils/build-callback-validation-failure-log.js', () => ({
  buildCallbackValidationFailureLog: vi.fn().mockReturnValue({}),
  buildCallbackPersistFailureLog: vi.fn().mockReturnValue({})
}))

const { uploadCallback } = await import('../../../../../src/api/v1/callback/index.js')
const { persistMetadataWithOutbox } = await import('../../../../../src/services/metadata-service.js')

const buildMockRequest = (overrides = {}) => ({
  payload: {
    metadata: { sbi: 105000000 },
    form: {},
    uploadStatus: 'ready',
    numberOfRejectedFiles: 0
  },
  headers: { 'x-cdp-request-id': 'test-correlation-id' },
  info: { remoteAddress: '1.2.3.4' },
  ...overrides
})

const buildMockH = () => {
  const mockCode = vi.fn().mockReturnThis()
  const mockTakeover = vi.fn().mockReturnThis()
  const mockResponse = vi.fn().mockReturnValue({ code: mockCode, takeover: mockTakeover })
  return { response: mockResponse, continue: Symbol('continue') }
}

describe('callback handler — event 1 (document/created)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPublishAuditEvent.mockResolvedValue(undefined)
  })

  test('emits document/created for each inserted fileId on success', async () => {
    const fileId1 = 'file-id-1'
    const fileId2 = 'file-id-2'
    persistMetadataWithOutbox.mockResolvedValueOnce({
      insertedCount: 2,
      insertedIds: { 0: { toString: () => fileId1 }, 1: { toString: () => fileId2 } }
    })

    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    expect(mockPublishAuditEvent).toHaveBeenCalledTimes(2)
    expect(mockPublishAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationid: 'test-correlation-id',
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'created', entityid: fileId1 }],
          accounts: { sbi: '105000000' },
          status: 'success'
        })
      })
    )
  })

  test('does not emit document/created for duplicate callbacks', async () => {
    persistMetadataWithOutbox.mockResolvedValueOnce({
      duplicate: true,
      correlationId: 'existing-id'
    })

    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    expect(mockPublishAuditEvent).not.toHaveBeenCalled()
  })

  test('audit failure does not affect 201 response', async () => {
    persistMetadataWithOutbox.mockResolvedValueOnce({
      insertedCount: 1,
      insertedIds: { 0: { toString: () => 'file-id-1' } }
    })
    mockPublishAuditEvent.mockRejectedValueOnce(new Error('SNS down'))

    const request = buildMockRequest()
    const h = buildMockH()

    const result = await uploadCallback.options.handler(request, h)

    expect(h.response).toHaveBeenCalledWith(expect.objectContaining({ message: 'Metadata created' }))
    expect(result.code).toBeDefined()
  })

  test('logs error.type from err.constructor.name when available', async () => {
    class SNSError extends Error {}
    const err = new SNSError('connection refused')

    persistMetadataWithOutbox.mockResolvedValueOnce({
      insertedCount: 1,
      insertedIds: { 0: { toString: () => 'file-id-1' } }
    })
    mockPublishAuditEvent.mockRejectedValueOnce(err)

    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ type: 'SNSError' })
      }),
      'Failed to send audit event'
    )
  })

  test('logs error.type from err.name when constructor.name is absent', async () => {
    const err = Object.create(null)
    err.message = 'connection refused'
    err.name = 'SpecialError'
    err.stack = ''

    persistMetadataWithOutbox.mockResolvedValueOnce({
      insertedCount: 1,
      insertedIds: { 0: { toString: () => 'file-id-1' } }
    })
    mockPublishAuditEvent.mockRejectedValueOnce(err)

    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ type: 'SpecialError' })
      }),
      'Failed to send audit event'
    )
  })

  test('logs error.type as fallback "Error" when neither constructor.name nor name is set', async () => {
    const err = Object.create(null)
    err.message = 'connection refused'
    err.stack = ''

    persistMetadataWithOutbox.mockResolvedValueOnce({
      insertedCount: 1,
      insertedIds: { 0: { toString: () => 'file-id-1' } }
    })
    mockPublishAuditEvent.mockRejectedValueOnce(err)

    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ type: 'Error' })
      }),
      'Failed to send audit event'
    )
  })
})
