import { constants as httpConstants } from 'node:http2'
import { performance } from 'node:perf_hooks'
import { vi, describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createManyMetadataDocuments, mockMetadataResponseAlt } from '../../../mocks/metadata.js'
import { baseMetadata } from '../../../mocks/base-data.js'
import { config } from '../../../../src/config/index.js'
import { getDb, connectDb, closeDb } from '../../../../src/data/db.js'
import { assertValidAuditEvent } from '../../../helpers/validate-audit-payload.js'

const capturedAuditEvents = []

vi.mock('@defra/fcp-audit-publisher', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    publishAuditEvent: vi.fn().mockImplementation(async (event, config) => {
      // Simulate what @defra/fcp-audit-publisher does: add required fields
      const enrichedEvent = {
        datetime: new Date().toISOString(),
        version: config?.version || '1.0.0',
        application: config?.application,
        component: config?.component,
        environment: config?.environment,
        ip: config?.ip || '0.0.0.0',
        correlationid: event.correlationid || config?.generateCorrelationId ? crypto.randomUUID() : undefined,
        audit: event.audit
      }
      capturedAuditEvents.push(enrichedEvent)
    })
  }
})

const METADATA_COLLECTION_CONFIG_KEY = 'mongo.collections.uploadMetadata'
const PAGE_SIZE_CONFIG_KEY = 'mongo.metadataSbiPageSize'
const MAX_PAGE_SIZE_CONFIG_KEY = 'mongo.metadataSbiMaxPageSize'
const METADATA_BY_SBI_PATH = '/api/v1/metadata/sbi/'
const TEST_COLLECTION = 'metadata-many-documents-test-collection'

// Comfortably above 2,000, and not a multiple of the maximum page size, so the
// final page of a full walk is a partial page.
const TOTAL_DOCUMENTS = 3050
const INSERT_BATCH_SIZE = 500

// A coarse guard against O(n) work in the number of stored documents
// reappearing on the request path. It is deliberately generous and is not a
// benchmark: a single bounded page should finish far inside it.
const SINGLE_PAGE_CEILING_MS = 2000

// Seeding several thousand documents and walking every page take longer than
// Vitest's default hook and test timeouts allow on a slow CI runner.
const SEED_TIMEOUT_MS = 30000
const WALK_TIMEOUT_MS = 30000

const SBI_ID_INDEX_NAME = 'metadata_sbi_id_idx'

// The uploadMetadata indexes created by createIndexes() in src/data/db.js, with
// the same keys and names. createIndexes() reads every collection name from
// config, so it is not called here: this collection is created after startup.
const UPLOAD_METADATA_INDEXES = [
  { key: { 'file.fileId': 1 }, name: 'metadata_fileId_idx', unique: true },
  { key: { 'metadata.sbi': 1 }, name: 'metadata_sbi_idx' },
  { key: { 'metadata.sbi': 1, _id: -1 }, name: SBI_ID_INDEX_NAME }
]

const sbi = baseMetadata.sbi
const seededDocuments = createManyMetadataDocuments(TOTAL_DOCUMENTS)
const newestFirstFileIds = seededDocuments.map(doc => doc.file.fileId).reverse()

let db
let server
let originalCollection

const requestPage = (query = '') => server.inject({
  method: 'GET',
  url: `${METADATA_BY_SBI_PATH}${sbi}${query}`
})

const timeRequest = async (query) => {
  const startedAt = performance.now()
  const response = await requestPage(query)
  return { response, elapsedMs: performance.now() - startedAt }
}

const assertSingleReadEvent = (response) => {
  expect(capturedAuditEvents).toHaveLength(1)

  const [event] = capturedAuditEvents
  assertValidAuditEvent(event)
  expect(event.audit.accounts).toEqual({ sbi: String(sbi) })
  expect(event.audit.status).toBe('success')
  expect(event.audit.details).toEqual({
    count: response.result.data.length,
    pageSize: response.result.page.pageSize
  })
  expect(event.audit.entities).toHaveLength(response.result.data.length)
  expect(event.audit.entities).toEqual(
    response.result.data.map(doc => ({ entity: 'document', action: 'read', entityid: doc.file.fileId }))
  )

  const serialised = JSON.stringify(event)
  expect(serialised).not.toContain('crn')
  expect(serialised).not.toContain(String(baseMetadata.crn))
}

/**
 * Collects every plan node that names a stage, at any depth. Stages nest under
 * inputStage or inputStages, and on the slot based engine under queryPlan, so
 * the walk follows every nested object rather than named keys.
 *
 * @param {unknown} node explain plan node, or any value inside one
 * @returns {Array<{ stage: string, indexName?: string }>} the stage nodes found
 */
const collectPlanStages = (node) => {
  if (Array.isArray(node)) {
    return node.flatMap(collectPlanStages)
  }

  if (node === null || typeof node !== 'object') {
    return []
  }

  const ownStage = typeof node.stage === 'string' ? [{ stage: node.stage, indexName: node.indexName }] : []
  return [...ownStage, ...Object.values(node).flatMap(collectPlanStages)]
}

beforeAll(async () => {
  await connectDb()
  db = getDb()

  const { createServer } = await import('../../../../src/api')

  originalCollection = config.get(METADATA_COLLECTION_CONFIG_KEY)
  config.set(METADATA_COLLECTION_CONFIG_KEY, TEST_COLLECTION)

  const collection = db.collection(TEST_COLLECTION)
  await collection.deleteMany({})
  await collection.createIndexes(UPLOAD_METADATA_INDEXES)

  for (let start = 0; start < seededDocuments.length; start += INSERT_BATCH_SIZE) {
    await collection.insertMany(seededDocuments.slice(start, start + INSERT_BATCH_SIZE))
  }

  // Newer records for a different SBI. A plan that walked the _id index alone
  // would have to examine these, which the totalDocsExamined bound would catch.
  await collection.insertMany(mockMetadataResponseAlt.map(doc => ({ ...doc })))

  server = await createServer()
  await server.initialize()
}, SEED_TIMEOUT_MS)

afterAll(async () => {
  await server.stop()
  await db.collection(TEST_COLLECTION).drop()
  config.set(METADATA_COLLECTION_CONFIG_KEY, originalCollection)
  await closeDb()
})

describe('GET /api/v1/metadata/sbi/{sbi} with several thousand documents for one SBI', () => {
  test('returns the configured default page size, newest first, with a further page when no query is supplied', async () => {
    capturedAuditEvents.length = 0
    const defaultPageSize = config.get(PAGE_SIZE_CONFIG_KEY)

    const response = await requestPage()

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data).toHaveLength(defaultPageSize)
    expect(response.result.data.map(doc => doc.file.fileId)).toEqual(newestFirstFileIds.slice(0, defaultPageSize))
    expect(response.result.page).toStrictEqual({
      pageSize: defaultPageSize,
      count: defaultPageSize,
      hasMore: true,
      nextCursor: response.result.data.at(-1)._id.toHexString()
    })
    assertSingleReadEvent(response)
  })

  test('returns exactly the maximum page size when it is requested', async () => {
    capturedAuditEvents.length = 0
    const maxPageSize = config.get(MAX_PAGE_SIZE_CONFIG_KEY)

    const response = await requestPage(`?pageSize=${maxPageSize}`)

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(response.result.data).toHaveLength(maxPageSize)
    expect(response.result.page.count).toBe(maxPageSize)
    expect(response.result.page.hasMore).toBe(true)
    assertSingleReadEvent(response)
  })

  test('returns 400 and emits no read event when the page size is above the maximum', async () => {
    capturedAuditEvents.length = 0

    const response = await requestPage(`?pageSize=${config.get(MAX_PAGE_SIZE_CONFIG_KEY) + 1}`)

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_BAD_REQUEST)
    expect(response.result.validation.source).toBe('query')
    expect(capturedAuditEvents).toHaveLength(0)
  })

  test('returns every document exactly once, newest first, when the next cursor is followed at the maximum page size', async () => {
    const maxPageSize = config.get(MAX_PAGE_SIZE_CONFIG_KEY)
    const expectedRequests = Math.ceil(TOTAL_DOCUMENTS / maxPageSize)
    const walkedFileIds = []
    let requestCount = 0

    const fetchAndRecordPage = async (query) => {
      capturedAuditEvents.length = 0
      const response = await requestPage(query)

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
      assertSingleReadEvent(response)
      walkedFileIds.push(...response.result.data.map(doc => doc.file.fileId))
      return response
    }

    let response = await fetchAndRecordPage(`?pageSize=${maxPageSize}`)
    requestCount += 1
    // the request count bound stops a cursor that never ends from looping for ever
    for (; response.result.page.hasMore && requestCount < expectedRequests; requestCount += 1) {
      response = await fetchAndRecordPage(`?pageSize=${maxPageSize}&after=${response.result.page.nextCursor}`)
    }

    expect(response.result.page.hasMore).toBe(false)
    expect(response.result.page.nextCursor).toBeNull()
    expect(requestCount).toBe(expectedRequests)
    expect(new Set(walkedFileIds).size).toBe(TOTAL_DOCUMENTS)
    expect(walkedFileIds).toEqual(newestFirstFileIds)
  }, WALK_TIMEOUT_MS)

  test.each([
    ['the configured default page size', () => ''],
    ['the configured maximum page size', () => `?pageSize=${config.get(MAX_PAGE_SIZE_CONFIG_KEY)}`]
  ])('completes a single page request at %s within the coarse ceiling', async (_description, buildQuery) => {
    const { response, elapsedMs } = await timeRequest(buildQuery())

    expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_OK)
    expect(elapsedMs).toBeLessThan(SINGLE_PAGE_CEILING_MS)
  })
})

describe('the page query plan on the test collection', () => {
  test.each([
    ['the first page', () => ({ 'metadata.sbi': sbi })],
    ['a page after a cursor', () => ({ 'metadata.sbi': sbi, _id: { $lt: seededDocuments[TOTAL_DOCUMENTS / 2]._id } })]
  ])('uses an index scan on metadata_sbi_id_idx with no sort stage for %s', async (_description, buildFilter) => {
    const maxPageSize = config.get(MAX_PAGE_SIZE_CONFIG_KEY)

    // mirrors the query built by getMetadataPageBySbi in src/repos/metadata.js
    const explain = await db.collection(TEST_COLLECTION)
      .find(buildFilter())
      .project({ metadata: 1, file: 1 })
      .sort({ _id: -1 })
      .limit(maxPageSize + 1)
      .explain('executionStats')

    const winningStages = collectPlanStages(explain.queryPlanner.winningPlan)
    const indexScans = winningStages.filter(({ stage }) => stage === 'IXSCAN').map(({ indexName }) => indexName)

    expect(indexScans).toEqual([SBI_ID_INDEX_NAME])
    expect(winningStages.some(({ stage }) => stage.startsWith('SORT'))).toBe(false)
    expect(explain.executionStats.nReturned).toBe(maxPageSize + 1)
    expect(explain.executionStats.totalDocsExamined).toBeLessThanOrEqual(maxPageSize + 1)
  })
})
