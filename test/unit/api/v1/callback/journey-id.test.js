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

const { uploadCallback } = await import('../../../../../src/api/v1/callback/index.js')
const { persistMetadataWithOutbox, persistValidationFailureStatus } = await import('../../../../../src/services/metadata-service.js')
const { resolveJourneyId } = await import('../../../../../src/services/journey-correlation-service.js')
const { validateCallbackPayload } = await import('../../../../../src/api/v1/callback/validation/validate-callback-payload.js')

const JOURNEY_ID = '550e8400-e29b-41d4-a716-446655440000'
const GENERATED_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

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

const buildMockRequest = (metadata = businessMetadata) => ({
  payload: {
    metadata,
    form: {},
    uploadStatus: 'ready',
    numberOfRejectedFiles: 0
  },
  headers: { 'x-cdp-request-id': 'test-correlation-id' },
  info: { remoteAddress: '1.2.3.4' }
})

const buildMockH = () => {
  const mockCode = vi.fn().mockReturnThis()
  const mockTakeover = vi.fn().mockReturnThis()
  const mockResponse = vi.fn().mockReturnValue({ code: mockCode, takeover: mockTakeover })
  return { response: mockResponse, continue: Symbol('continue') }
}

describe('callback journey id threading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    validateCallbackPayload.mockResolvedValue(null)
    persistMetadataWithOutbox.mockResolvedValue({ insertedCount: 1, insertedIds: { 0: { toString: () => 'file-id-1' } } })
    resolveJourneyId.mockResolvedValue({ journeyId: JOURNEY_ID, source: 'session' })
  })

  describe('handler', () => {
    test('resolves the journey id carried in the payload metadata', async () => {
      const request = buildMockRequest({ ...businessMetadata, journeyId: JOURNEY_ID })

      await uploadCallback.options.handler(request, buildMockH())

      expect(resolveJourneyId).toHaveBeenCalledWith(JOURNEY_ID, businessMetadata)
    })

    test('persists the resolved journey id as the correlation id', async () => {
      const request = buildMockRequest({ ...businessMetadata, journeyId: JOURNEY_ID })

      await uploadCallback.options.handler(request, buildMockH())

      expect(persistMetadataWithOutbox).toHaveBeenCalledWith(expect.anything(), JOURNEY_ID)
    })

    test('strips the journey id out of the metadata it persists', async () => {
      const request = buildMockRequest({ ...businessMetadata, journeyId: JOURNEY_ID })

      await uploadCallback.options.handler(request, buildMockH())

      const [persistedPayload] = persistMetadataWithOutbox.mock.calls[0]
      expect(persistedPayload.metadata).not.toHaveProperty('journeyId')
      expect(persistedPayload.metadata).toEqual(businessMetadata)
      expect(persistedPayload.form).toBe(request.payload.form)
    })

    test('leaves the request payload unmodified', async () => {
      const request = buildMockRequest({ ...businessMetadata, journeyId: JOURNEY_ID })

      await uploadCallback.options.handler(request, buildMockH())

      expect(request.payload.metadata.journeyId).toBe(JOURNEY_ID)
    })

    test('uses the generated id when the payload carries no journey id', async () => {
      resolveJourneyId.mockResolvedValue({ journeyId: GENERATED_ID, source: 'generated' })

      await uploadCallback.options.handler(buildMockRequest(), buildMockH())

      expect(resolveJourneyId).toHaveBeenCalledWith(undefined, businessMetadata)
      expect(persistMetadataWithOutbox).toHaveBeenCalledWith(expect.anything(), GENERATED_ID)
    })

    test('passes the resolved journey id into payload validation', async () => {
      const request = buildMockRequest({ ...businessMetadata, journeyId: JOURNEY_ID })

      await uploadCallback.options.handler(request, buildMockH())

      expect(validateCallbackPayload).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: businessMetadata }),
        expect.anything(),
        JOURNEY_ID
      )
    })

    test('resolves against empty metadata when the payload has none', async () => {
      resolveJourneyId.mockResolvedValue({ journeyId: GENERATED_ID, source: 'generated' })

      await uploadCallback.options.handler({ headers: {} }, buildMockH())

      expect(resolveJourneyId).toHaveBeenCalledWith(undefined, {})
      expect(persistMetadataWithOutbox).toHaveBeenCalledWith(expect.anything(), GENERATED_ID)
    })

    test('returns no correlation id to the caller on a duplicate', async () => {
      // The service still resolves the stored identifier and logs it as duplicate_callback,
      // and test/unit/services/metadata-service.test.js pins that it is the stored value
      // rather than the resolved one. The route does not put it in the response body.
      persistMetadataWithOutbox.mockResolvedValue({ duplicate: true, correlationId: 'stored-id' })
      const h = buildMockH()

      await uploadCallback.options.handler(buildMockRequest(), h)

      expect(h.response).toHaveBeenCalledWith({ message: 'Duplicate callback ignored' })
    })

    test('does not leak the resolved journey id on a duplicate either', async () => {
      persistMetadataWithOutbox.mockResolvedValue({ duplicate: true, correlationId: 'stored-id' })
      const h = buildMockH()

      await uploadCallback.options.handler(buildMockRequest({ ...businessMetadata, journeyId: JOURNEY_ID }), h)

      const [body] = h.response.mock.calls[0]
      expect(JSON.stringify(body)).not.toContain(JOURNEY_ID)
      expect(JSON.stringify(body)).not.toContain('stored-id')
    })
  })

  describe('failAction', () => {
    const { failAction } = uploadCallback.options.validate

    test('persists the validation failure under the resolved journey id', async () => {
      const request = buildMockRequest({ ...businessMetadata, journeyId: JOURNEY_ID })
      const err = new Error('bad payload')

      await failAction(request, buildMockH(), err)

      expect(resolveJourneyId).toHaveBeenCalledWith(JOURNEY_ID, businessMetadata)
      expect(persistValidationFailureStatus).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: businessMetadata }),
        err,
        JOURNEY_ID
      )
    })

    test('strips the journey id out of the payload it persists', async () => {
      const request = buildMockRequest({ ...businessMetadata, journeyId: JOURNEY_ID })

      await failAction(request, buildMockH(), new Error('bad payload'))

      const [persistedPayload] = persistValidationFailureStatus.mock.calls[0]
      expect(persistedPayload.metadata).not.toHaveProperty('journeyId')
    })

    test('uses the generated id when the payload carries no journey id', async () => {
      resolveJourneyId.mockResolvedValue({ journeyId: GENERATED_ID, source: 'generated' })

      await failAction(buildMockRequest(), buildMockH(), new Error('bad payload'))

      expect(persistValidationFailureStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Error),
        GENERATED_ID
      )
    })

    test('still answers 201 when the payload is absent altogether', async () => {
      resolveJourneyId.mockResolvedValue({ journeyId: GENERATED_ID, source: 'generated' })
      const h = buildMockH()

      const result = await failAction({ headers: {} }, h, new Error('no payload'))

      expect(resolveJourneyId).toHaveBeenCalledWith(undefined, {})
      expect(result.code).toHaveBeenCalledWith(201)
    })

    test('still answers 201 when persisting the failure throws', async () => {
      persistValidationFailureStatus.mockRejectedValueOnce(new Error('db down'))
      const h = buildMockH()

      const result = await failAction(buildMockRequest(), h, new Error('bad payload'))

      expect(result.code).toHaveBeenCalledWith(201)
    })
  })
})
