import { describe, test, expect, vi, beforeEach } from 'vitest'

const { mockConfigGet } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    switch (key) {
      case 'baseUrl.v1': return '/api/v1'
      case 'tracing.header': return 'x-cdp-request-id'
      case 'cdpUploaderMimeTypes': return ['application/pdf', 'image/jpeg', 'image/png']
      case 'cdpUploaderDocumentTypes': return ['CS_Agreement_Evidence', 'CS_Application_Evidence']
      default: return null
    }
  })
}))

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }

vi.mock('../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

vi.mock('../../../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../../../src/services/metadata-service.js', () => ({
  persistMetadataWithOutbox: vi.fn(),
  persistValidationFailureStatus: vi.fn()
}))

vi.mock('../../../../../src/services/journey-correlation-service.js', () => ({
  resolveJourneyId: vi.fn()
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

// The store itself is deliberately NOT mocked. Asserting that runWithCorrelationId was
// called would only prove the wrapper is present; reading getCorrelationId() from inside a
// mocked downstream call proves the handler body actually executes within the scope, which
// is what puts transaction.id on every log line the request emits.
const { uploadCallback } = await import('../../../../../src/api/v1/callback/index.js')
const { persistMetadataWithOutbox, persistValidationFailureStatus } = await import('../../../../../src/services/metadata-service.js')
const { resolveJourneyId } = await import('../../../../../src/services/journey-correlation-service.js')
const { validateCallbackPayload } = await import('../../../../../src/api/v1/callback/validation/validate-callback-payload.js')
const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')
const { getCorrelationId } = await import('../../../../../src/logging/correlation-id-store.js')

const JOURNEY_ID = '550e8400-e29b-41d4-a716-446655440000'

const businessMetadata = {
  sbi: 105000000,
  crn: 1101009926,
  frn: 1101009900,
  submissionId: '1733826312',
  type: 'CS_Agreement_Evidence',
  reference: 'a reference',
  service: 'fcp-sfd-frontend',
  uosr: '105000000-1733826312'
}

const buildMockRequest = () => ({
  payload: {
    metadata: { ...businessMetadata, journeyId: JOURNEY_ID },
    form: {},
    uploadStatus: 'ready',
    numberOfRejectedFiles: 0
  },
  // Deliberately different from the resolved id. The uploader never sends this header, and
  // the route must not fall back to it.
  headers: { 'x-cdp-request-id': 'test-correlation-id' },
  info: { remoteAddress: '1.2.3.4' }
})

const buildMockH = () => {
  const mockCode = vi.fn().mockReturnThis()
  const mockTakeover = vi.fn().mockReturnThis()
  const mockResponse = vi.fn().mockReturnValue({ code: mockCode, takeover: mockTakeover })
  return { response: mockResponse, continue: Symbol('continue') }
}

describe('callback correlation store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    validateCallbackPayload.mockResolvedValue(null)
    persistMetadataWithOutbox.mockResolvedValue({ insertedCount: 1, insertedIds: { 0: { toString: () => 'file-id-1' } } })
    resolveJourneyId.mockResolvedValue({ journeyId: JOURNEY_ID, source: 'session' })
  })

  describe('handler', () => {
    test('runs the persistence call inside the correlation store', async () => {
      let seen
      persistMetadataWithOutbox.mockImplementation(async () => {
        seen = getCorrelationId()
        return { insertedCount: 1, insertedIds: { 0: { toString: () => 'file-id-1' } } }
      })

      await uploadCallback.options.handler(buildMockRequest(), buildMockH())

      expect(seen).toBe(JOURNEY_ID)
    })

    test('runs payload validation inside the correlation store', async () => {
      let seen
      validateCallbackPayload.mockImplementation(async () => {
        seen = getCorrelationId()
        return null
      })

      await uploadCallback.options.handler(buildMockRequest(), buildMockH())

      expect(seen).toBe(JOURNEY_ID)
    })

    test('runs audit publication inside the correlation store', async () => {
      let seen
      sendAuditEvent.mockImplementation(async () => {
        seen = getCorrelationId()
      })

      await uploadCallback.options.handler(buildMockRequest(), buildMockH())

      expect(seen).toBe(JOURNEY_ID)
    })

    test('leaves the store empty once the request is done', async () => {
      await uploadCallback.options.handler(buildMockRequest(), buildMockH())

      // The scope is per request. A value leaking outside it would attach one upload's id
      // to an unrelated request handled later on the same worker.
      expect(getCorrelationId()).toBeUndefined()
    })

    test('does not fall back to the tracing header when resolving', async () => {
      let seen
      persistMetadataWithOutbox.mockImplementation(async () => {
        seen = getCorrelationId()
        return { insertedCount: 1, insertedIds: { 0: { toString: () => 'file-id-1' } } }
      })

      await uploadCallback.options.handler(buildMockRequest(), buildMockH())

      expect(seen).not.toBe('test-correlation-id')
    })
  })

  describe('failAction', () => {
    test('runs the failure persistence inside the correlation store', async () => {
      let seen
      persistValidationFailureStatus.mockImplementation(async () => {
        seen = getCorrelationId()
      })

      await uploadCallback.options.validate.failAction(buildMockRequest(), buildMockH(), new Error('Validation failed'))

      expect(seen).toBe(JOURNEY_ID)
    })

    test('runs audit publication inside the correlation store', async () => {
      let seen
      sendAuditEvent.mockImplementation(async () => {
        seen = getCorrelationId()
      })

      await uploadCallback.options.validate.failAction(buildMockRequest(), buildMockH(), new Error('Validation failed'))

      expect(seen).toBe(JOURNEY_ID)
    })

    test('leaves the store empty once the request is done', async () => {
      await uploadCallback.options.validate.failAction(buildMockRequest(), buildMockH(), new Error('Validation failed'))

      expect(getCorrelationId()).toBeUndefined()
    })
  })
})
