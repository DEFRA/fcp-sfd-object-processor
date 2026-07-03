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

const mockSendAuditEvent = vi.fn().mockResolvedValue(undefined)

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
  sendAuditEvent: mockSendAuditEvent
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
const { persistMetadataWithOutbox, persistValidationFailureStatus } = await import('../../../../../src/services/metadata-service.js')

const buildMockRequest = (overrides = {}) => ({
  payload: {
    metadata: { sbi: 105000000 },
    form: { file1: { fileId: 'payload-file-id-1' } },
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
    mockSendAuditEvent.mockResolvedValue(undefined)
  })

  test('emits document/failed per payload fileId when persistMetadataWithOutbox throws', async () => {
    persistMetadataWithOutbox.mockRejectedValueOnce(new Error('DB failure'))

    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationid: 'test-correlation-id',
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'failed', entityid: 'payload-file-id-1' }],
          accounts: { sbi: '105000000' },
          status: 'failure',
          details: { reason: 'callback_processing_failure' }
        })
      })
    )
  })

  test('falls back to "unknown" entityid when form contains no fileId', async () => {
    persistMetadataWithOutbox.mockRejectedValueOnce(new Error('DB failure'))

    const request = buildMockRequest({ payload: { metadata: { sbi: 105000000 }, form: {}, uploadStatus: 'ready', numberOfRejectedFiles: 0 } })
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'failed', entityid: 'unknown' }]
        })
      })
    )
  })

  test('uses empty string sbi when metadata.sbi is absent', async () => {
    persistMetadataWithOutbox.mockRejectedValueOnce(new Error('DB failure'))

    const request = buildMockRequest({ payload: { metadata: {}, form: { file1: { fileId: 'f1' } }, uploadStatus: 'ready', numberOfRejectedFiles: 0 } })
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          accounts: { sbi: '' }
        })
      })
    )
  })

  test('Boom.internal is still returned after emitting audit event', async () => {
    persistMetadataWithOutbox.mockRejectedValueOnce(new Error('DB failure'))

    const request = buildMockRequest()
    const h = buildMockH()

    const result = await uploadCallback.options.handler(request, h)

    expect(result.isBoom).toBe(true)
    expect(result.output.statusCode).toBe(500)
  })

  test('audit entity contains no payload contents', async () => {
    persistMetadataWithOutbox.mockRejectedValueOnce(new Error('DB failure'))

    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    const callArgs = JSON.stringify(mockSendAuditEvent.mock.calls[0])
    expect(callArgs).not.toContain('uploadStatus')
  })

  test('does not emit audit event on duplicate callback', async () => {
    persistMetadataWithOutbox.mockResolvedValueOnce({ duplicate: true, correlationId: 'existing-id' })

    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.handler(request, h)

    expect(mockSendAuditEvent).not.toHaveBeenCalled()
  })
})

describe('callback handler — event 5 (document/failed on Joi validation failure)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendAuditEvent.mockResolvedValue(undefined)
  })

  test('returns 201 response in failAction', async () => {
    const mockErr = new Error('Validation failed')
    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.validate.failAction(request, h, mockErr)

    expect(h.response).toHaveBeenCalledWith({ message: 'Validation failure persisted' })
  })

  test('logs error during failAction', async () => {
    const mockErr = new Error('Validation failed')
    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.validate.failAction(request, h, mockErr)

    expect(mockLogger.error).toHaveBeenCalled()
  })

  test('persists validation failure status in failAction', async () => {
    const mockErr = new Error('Validation failed')
    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.validate.failAction(request, h, mockErr)

    expect(persistValidationFailureStatus).toHaveBeenCalledWith(request.payload, mockErr)
  })

  test('emits document/failed per payload fileId in failAction', async () => {
    const mockErr = new Error('Validation failed')
    const request = buildMockRequest()
    const h = buildMockH()

    await uploadCallback.options.validate.failAction(request, h, mockErr)

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationid: 'test-correlation-id',
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'failed', entityid: 'payload-file-id-1' }],
          accounts: { sbi: '105000000' },
          status: 'failure',
          details: { reason: 'payload_validation_failure' }
        })
      })
    )
  })

  test('falls back to "unknown" entityid when form contains no fileId in failAction', async () => {
    const mockErr = new Error('Validation failed')
    const request = buildMockRequest({ payload: { metadata: { sbi: 105000000 }, form: {}, uploadStatus: 'ready', numberOfRejectedFiles: 0 } })
    const h = buildMockH()

    await uploadCallback.options.validate.failAction(request, h, mockErr)

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'failed', entityid: 'unknown' }]
        })
      })
    )
  })

  test('uses empty string sbi when metadata.sbi is absent in failAction', async () => {
    const mockErr = new Error('Validation failed')
    const request = buildMockRequest({ payload: { metadata: {}, form: { file1: { fileId: 'f1' } }, uploadStatus: 'ready', numberOfRejectedFiles: 0 } })
    const h = buildMockH()

    await uploadCallback.options.validate.failAction(request, h, mockErr)

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          accounts: { sbi: '' }
        })
      })
    )
  })
})
