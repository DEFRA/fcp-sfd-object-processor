import { describe, test, expect, vi, beforeEach } from 'vitest'
import { constants as httpConstants } from 'node:http2'
import { ObjectId } from 'mongodb'

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

vi.mock('../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() })
}))

vi.mock('../../../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../../../src/repos/metadata.js', () => ({
  getMetadataPageBySbi: vi.fn()
}))

const { metadataRoute } = await import('../../../../../src/api/v1/metadata/index.js')
const { getMetadataPageBySbi } = await import('../../../../../src/repos/metadata.js')
const { metadataQuerySchema } = await import('../../../../../src/api/v1/metadata/schemas/index.js')
const { responseFailAction } = await import('../../../../../src/api/common/helpers/response-fail-action.js')
const { NotFoundError } = await import('../../../../../src/errors/not-found-error.js')

const sbi = 105000000
const pageSize = 2
const cursor = '66f9c1e2a3b4c5d6e7f80912'

const buildMockRequest = (query = { pageSize }) => ({
  params: { sbi: String(sbi) },
  query,
  headers: { 'x-cdp-request-id': 'test-correlation-id' }
})

const buildMockH = () => {
  const mockCode = vi.fn().mockReturnThis()
  return { response: vi.fn().mockReturnValue({ code: mockCode }) }
}

const buildDocuments = () => [
  { _id: new ObjectId(), file: { fileId: 'file-2' }, metadata: { sbi } },
  { _id: new ObjectId(), file: { fileId: 'file-1' }, metadata: { sbi } }
]

describe('metadata route options', () => {
  test('validates the query string with the metadata query schema', () => {
    expect(metadataRoute.options.validate.query).toBe(metadataQuerySchema)
  })

  test('handles response validation failures with the field path only failAction', () => {
    expect(metadataRoute.options.response.failAction).toBe(responseFailAction)
  })
})

describe('metadata handler pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('reads the first page with the requested page size and no cursor when after is absent', async () => {
    getMetadataPageBySbi.mockResolvedValueOnce({ documents: buildDocuments(), hasMore: false, nextCursor: null })

    await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(getMetadataPageBySbi).toHaveBeenCalledWith(sbi, { pageSize, after: undefined })
  })

  test('converts after to an ObjectId with the same hex value when after is supplied', async () => {
    getMetadataPageBySbi.mockResolvedValueOnce({ documents: buildDocuments(), hasMore: false, nextCursor: null })

    await metadataRoute.handler(buildMockRequest({ pageSize, after: cursor }), buildMockH())

    const [, options] = getMetadataPageBySbi.mock.calls[0]
    expect(options.after).toBeInstanceOf(ObjectId)
    expect(options.after.toHexString()).toBe(cursor)
  })

  test('responds 200 with the documents and a page object when more pages exist', async () => {
    const documents = buildDocuments()
    getMetadataPageBySbi.mockResolvedValueOnce({ documents, hasMore: true, nextCursor: cursor })
    const h = buildMockH()

    const result = await metadataRoute.handler(buildMockRequest(), h)

    expect(h.response).toHaveBeenCalledWith({
      data: documents,
      page: { pageSize, count: documents.length, hasMore: true, nextCursor: cursor }
    })
    expect(result.code).toHaveBeenCalledWith(httpConstants.HTTP_STATUS_OK)
  })

  test('responds 200 with an empty page when a cursor page has no documents', async () => {
    getMetadataPageBySbi.mockResolvedValueOnce({ documents: [], hasMore: false, nextCursor: null })
    const h = buildMockH()

    await metadataRoute.handler(buildMockRequest({ pageSize, after: cursor }), h)

    expect(h.response).toHaveBeenCalledWith({
      data: [],
      page: { pageSize, count: 0, hasMore: false, nextCursor: null }
    })
  })

  test('returns a 404 when the repository finds no documents', async () => {
    getMetadataPageBySbi.mockRejectedValueOnce(new NotFoundError('No documents found'))

    const result = await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(result.isBoom).toBe(true)
    expect(result.output.statusCode).toBe(httpConstants.HTTP_STATUS_NOT_FOUND)
  })

  test('returns a 500 when the repository fails', async () => {
    getMetadataPageBySbi.mockRejectedValueOnce(new Error('db down'))

    const result = await metadataRoute.handler(buildMockRequest(), buildMockH())

    expect(result.isBoom).toBe(true)
    expect(result.output.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
  })
})
