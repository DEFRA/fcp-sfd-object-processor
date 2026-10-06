import { describe, test, expect, vi, beforeEach } from 'vitest'
import { constants as httpConstants } from 'node:http2'

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}))

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

const { responseFailAction } = await import('../../../../../src/api/common/helpers/response-fail-action.js')
const { metadataResponseSchema } = await import('../../../../../src/api/v1/metadata/schemas/index.js')
const { baseMetadata } = await import('../../../../mocks/base-data.js')

const invalidCrn = 12345
const invalidFileId = 'not-a-uuid-value'
const filename = 'sensitive-filename.pdf'

const mockRequest = {
  path: '/api/v1/metadata/sbi/105000000',
  method: 'get'
}

// Produces a real Joi error from the route's own response schema, so the test covers
// exactly what Hapi passes to the failAction, including details[].context.value and _original.
const buildRealValidationError = () => {
  const { error } = metadataResponseSchema[httpConstants.HTTP_STATUS_OK].validate({
    data: [{
      _id: 'id',
      metadata: { ...baseMetadata, crn: invalidCrn },
      file: { fileId: invalidFileId, filename, contentType: 'application/pdf', fileStatus: 'complete' }
    }],
    page: { pageSize: 100, count: 1, hasMore: false, nextCursor: null }
  }, { abortEarly: false })
  return error
}

describe('responseFailAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('throws a 500 error', () => {
    expect(() => responseFailAction(mockRequest, {}, buildRealValidationError()))
      .toThrow(expect.objectContaining({
        isBoom: true,
        output: expect.objectContaining({ statusCode: httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR })
      }))
  })

  test('throws an error that does not carry the validation error or its values', () => {
    let thrown
    try {
      responseFailAction(mockRequest, {}, buildRealValidationError())
    } catch (err) {
      thrown = err
    }

    expect(thrown.data).toBeNull()
    expect(thrown.message).not.toContain(String(invalidCrn))
    expect(thrown.message).not.toContain(invalidFileId)
  })

  test('logs the failing field paths once at error level', () => {
    expect(() => responseFailAction(mockRequest, {}, buildRealValidationError())).toThrow()

    expect(mockLogger.error).toHaveBeenCalledTimes(1)
    const [logContext] = mockLogger.error.mock.calls[0]
    expect(logContext.event.type).toBe('response_validation_failure')
    expect(logContext.event.reason).toContain('data.0.metadata.crn')
    expect(logContext.event.reason).toContain('data.0.file.fileId')
  })

  test('logs no value from the response, including the CRN', () => {
    expect(() => responseFailAction(mockRequest, {}, buildRealValidationError())).toThrow()

    const logged = JSON.stringify(mockLogger.error.mock.calls)
    expect(logged).not.toContain(String(invalidCrn))
    expect(logged).not.toContain(String(baseMetadata.crn))
    expect(logged).not.toContain(invalidFileId)
    expect(logged).not.toContain(filename)
    expect(logged).not.toContain(baseMetadata.reference)
  })
})
