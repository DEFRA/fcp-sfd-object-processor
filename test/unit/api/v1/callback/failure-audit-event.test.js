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

vi.mock('../../../../../src/messaging/outbound/audit/publish-audit-event.js', () => ({
  publishAuditEvent: mockPublishAuditEvent
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
  return { response: mockResponse }
}

describe('callback handler — event 4 (document/failed on processing error)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPublishAuditEvent.mockResolvedValue(undefined)
  })

  test('emits document/failed when persistMetadataWithOutbox throws', async () => {
    persistMetadataWithOutbox.mockRejectedValueOnce(new Error('DB failure'))

    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    expect(mockPublishAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationid: 'test-correlation-id',
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'failed' }],
          status: 'failure',
          details: { reason: 'DB failure' }
        })
      })
    )
  })

  test('Boom.internal is still returned even when audit call throws', async () => {
    persistMetadataWithOutbox.mockRejectedValueOnce(new Error('DB failure'))
    mockPublishAuditEvent.mockRejectedValueOnce(new Error('SNS down'))

    const request = buildMockRequest()
    const h = buildMockH()

    const result = await uploadCallback.options.handler(request, h)

    expect(result.isBoom).toBe(true)
    expect(result.output.statusCode).toBe(500)
  })

  test('audit details contain no payload contents', async () => {
    persistMetadataWithOutbox.mockRejectedValueOnce(new Error('DB failure'))

    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    const callArgs = JSON.stringify(mockPublishAuditEvent.mock.calls[0])
    expect(callArgs).not.toContain('form')
    expect(callArgs).not.toContain('uploadStatus')
  })
})

describe('callback handler — event 5 (document/failed on Joi validation failure)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPublishAuditEvent.mockResolvedValue(undefined)
  })

  test('emits document/failed with static reason in failAction', async () => {
    const mockErr = new Error('Validation failed')
    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.validate.failAction(request, h, mockErr)

    expect(mockPublishAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationid: 'test-correlation-id',
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'failed' }],
          status: 'failure',
          details: { reason: 'payload_validation_failure' }
        })
      })
    )
  })

  test('audit details contain no Joi error details or payload contents', async () => {
    const mockErr = new Error('Validation failed')
    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.validate.failAction(request, h, mockErr)

    const callArgs = JSON.stringify(mockPublishAuditEvent.mock.calls[0])
    expect(callArgs).not.toContain('Validation failed')
    expect(callArgs).not.toContain('form')
  })

  test('audit failure does not prevent the 201 takeover response', async () => {
    mockPublishAuditEvent.mockRejectedValueOnce(new Error('SNS down'))

    const mockErr = new Error('Validation failed')
    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.validate.failAction(request, h, mockErr)

    expect(h.response).toHaveBeenCalledWith({ message: 'Validation failure persisted' })
  })
})
