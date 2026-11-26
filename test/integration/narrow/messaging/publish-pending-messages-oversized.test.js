import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { BatchRequestTooLongException, ThrottledException } from '@aws-sdk/client-sns'
import { publishAuditEvent } from '@defra/fcp-audit-publisher'

import { config } from '../../../../src/config/index.js'
import { getDb, connectDb, closeDb } from '../../../../src/data/db.js'
import { MESSAGE_TOO_LARGE_CODE, PENDING, PERMANENT_FAILURE, SENT } from '../../../../src/constants/outbox.js'
import { PUBLISH_FAILURE_OUTCOME } from '../../../../src/constants/metrics.js'
import { publishPendingMessages } from '../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js'
import { publishBatch } from '../../../../src/messaging/sns/publish-batch.js'
import { metricsCounter } from '../../../../src/api/common/helpers/metrics.js'
import { baseFileUpload3, baseMetadata, createFormattedDocument } from '../../../mocks/base-data.js'

vi.mock('../../../../src/messaging/sns/publish-batch.js')
vi.mock('../../../../src/api/common/helpers/metrics.js', () => ({
  metricsCounter: vi.fn(),
  metricsGauge: vi.fn(),
  metricsMillis: vi.fn()
}))
vi.mock('@defra/fcp-audit-publisher', async (importOriginal) => ({
  ...(await importOriginal()),
  publishAuditEvent: vi.fn()
}))

// The AWS PublishBatch default for the combined size of all messages in one
// request. Kept as a literal so the fake models SNS independently of the
// constants the publisher uses.
const SNS_BATCH_LIMIT_BYTES = 262144
const OVERSIZED_REFERENCE_LENGTH = 300000
const MAX_ATTEMPTS = 3
const PUBLISH_FAILED_METRIC = 'outbox.publish_failed'

const testRunPrefix = 'outbox-oversized-'
const originalConfig = {}
let db
let outboxCollection
let metadataCollection
let testRunId

const serialisedBytes = (batch) =>
  batch.reduce((total, message) => total + Buffer.byteLength(JSON.stringify(message), 'utf8'), 0)

// Behaves like SNS PublishBatch: rejects the whole request when its messages
// together exceed the limit, otherwise accepts every entry.
const fakeSnsPublishBatch = (limitBytes = SNS_BATCH_LIMIT_BYTES) => async (_client, _topic, batch) => {
  if (serialisedBytes(batch) > limitBytes) {
    throw new BatchRequestTooLongException({
      message: 'The length of all the batch messages put together is more than the limit.',
      $metadata: {}
    })
  }
  return {
    Successful: batch.map(message => ({ Id: message.id, MessageId: randomUUID() })),
    Failed: []
  }
}

const buildOutboxEntry = (label, reference, createdAt) => {
  const fileId = randomUUID()
  const fileUpload = { ...baseFileUpload3, fileId, filename: `${label}.pdf` }
  return {
    testRunId,
    messageId: randomUUID(),
    payload: createFormattedDocument({ ...baseMetadata, reference }, fileUpload),
    status: PENDING,
    attempts: 0,
    createdAt
  }
}

const seedEntries = async (specs) => {
  const entries = specs.map(([label, reference], index) =>
    buildOutboxEntry(label, reference, new Date(Date.UTC(2026, 10, 26, 10, 0, index))))

  await db.collection(outboxCollection).insertMany(entries)
  await db.collection(metadataCollection).insertMany(entries.map(entry => ({ ...entry.payload, testRunId })))

  return Object.fromEntries(entries.map((entry, index) => [specs[index][0], entry.payload.file.fileId]))
}

const findEntry = (fileId) => db.collection(outboxCollection).findOne({ 'payload.file.fileId': fileId })
const findMetadata = (fileId) => db.collection(metadataCollection).findOne({ 'file.fileId': fileId })

const runPolls = async (count) => {
  for (let poll = 0; poll < count; poll++) {
    await publishPendingMessages()
  }
}

const publishedIdsPerCall = () => publishBatch.mock.calls.map(([, , batch]) => batch.map(message => message.id))

const publishFailedCalls = () => metricsCounter.mock.calls
  .filter(([name]) => name === PUBLISH_FAILED_METRIC)
  .map(([, value, dimensions]) => ({ value, outcome: dimensions.outcome }))

const failedAuditEntityIds = () => publishAuditEvent.mock.calls
  .map(([event]) => event.audit.entities[0])
  .filter(entity => entity.action === 'failed')
  .map(entity => entity.entityid)

beforeAll(async () => {
  await connectDb()
  db = getDb()

  originalConfig.outboxCollection = config.get('mongo.collections.outbox')
  originalConfig.metadataCollection = config.get('mongo.collections.uploadMetadata')
  originalConfig.queryLimit = config.get('mongo.outboxQueryLimit')
  originalConfig.maxAttempts = config.get('messaging.outboxMaxAttempts')

  outboxCollection = `${originalConfig.outboxCollection}-oversized-integration`
  metadataCollection = `${originalConfig.metadataCollection}-oversized-integration`
  config.set('mongo.collections.outbox', outboxCollection)
  config.set('mongo.collections.uploadMetadata', metadataCollection)
})

beforeEach(() => {
  vi.clearAllMocks()
  publishBatch.mockReset()
  publishBatch.mockImplementation(fakeSnsPublishBatch())
  config.set('mongo.outboxQueryLimit', 100)
  config.set('messaging.outboxMaxAttempts', MAX_ATTEMPTS)
  testRunId = `${testRunPrefix}${randomUUID()}`
})

afterEach(async () => {
  await db.collection(outboxCollection).deleteMany({ testRunId: { $regex: `^${testRunPrefix}` } })
  await db.collection(metadataCollection).deleteMany({ testRunId: { $regex: `^${testRunPrefix}` } })
})

afterAll(async () => {
  await db.collection(outboxCollection).drop().catch(() => {})
  await db.collection(metadataCollection).drop().catch(() => {})
  config.set('mongo.collections.outbox', originalConfig.outboxCollection)
  config.set('mongo.collections.uploadMetadata', originalConfig.metadataCollection)
  config.set('mongo.outboxQueryLimit', originalConfig.queryLimit)
  config.set('messaging.outboxMaxAttempts', originalConfig.maxAttempts)
  await closeDb()
})

describe('publishing a batch that holds one oversized entry', () => {
  const seedBatchWithOversizedEntry = () => seedEntries([
    ['first', 'normal reference one'],
    ['oversized', 'x'.repeat(OVERSIZED_REFERENCE_LENGTH)],
    ['third', 'normal reference three']
  ])

  test('sends the in-limit entries and returns only the oversized entry to PENDING', async () => {
    const ids = await seedBatchWithOversizedEntry()

    await runPolls(1)

    expect(publishedIdsPerCall()).toEqual([[ids.first, ids.third]])
    for (const fileId of [ids.first, ids.third]) {
      const entry = await findEntry(fileId)
      expect(entry.status).toBe(SENT)
      expect(entry.attempts).toBe(1)
      expect((await findMetadata(fileId)).messaging.publishedAt).toBeInstanceOf(Date)
    }

    const oversized = await findEntry(ids.oversized)
    expect(oversized.status).toBe(PENDING)
    expect(oversized.attempts).toBe(1)
    expect(oversized.error.code).toBe(MESSAGE_TOO_LARGE_CODE)
    expect((await findMetadata(ids.oversized)).messaging.publishedAt).toBeNull()
  })

  test('fails only the oversized entry permanently after three attempts, without claiming the sent entries again', async () => {
    const ids = await seedBatchWithOversizedEntry()

    await runPolls(MAX_ATTEMPTS)

    const oversized = await findEntry(ids.oversized)
    expect(oversized.status).toBe(PERMANENT_FAILURE)
    expect(oversized.attempts).toBe(MAX_ATTEMPTS)
    expect(oversized.error.code).toBe(MESSAGE_TOO_LARGE_CODE)

    for (const fileId of [ids.first, ids.third]) {
      const entry = await findEntry(fileId)
      expect(entry.status).toBe(SENT)
      expect(entry.attempts).toBe(1)
    }
    expect(publishBatch).toHaveBeenCalledTimes(1)
  })

  test('counts only the oversized entry in outbox.publish_failed and in terminal audit events', async () => {
    const ids = await seedBatchWithOversizedEntry()

    await runPolls(MAX_ATTEMPTS)

    expect(publishFailedCalls()).toEqual([
      { value: 1, outcome: PUBLISH_FAILURE_OUTCOME.RETRYABLE },
      { value: 1, outcome: PUBLISH_FAILURE_OUTCOME.RETRYABLE },
      { value: 1, outcome: PUBLISH_FAILURE_OUTCOME.PERMANENT }
    ])
    expect(failedAuditEntityIds()).toEqual([ids.oversized])
  })
})

describe('publishing a batch that SNS rejects as too long although the splitter accepted it', () => {
  // SNS is made to count less room than the splitter allows, so the two
  // entries are packed together and the request is rejected as a whole.
  const stricterLimitBytes = 200000
  const largeReferenceLength = 110000

  test('resends the entries one per call so each reaches SENT on its first attempt', async () => {
    publishBatch.mockImplementation(fakeSnsPublishBatch(stricterLimitBytes))
    const ids = await seedEntries([
      ['first', 'a'.repeat(largeReferenceLength)],
      ['second', 'b'.repeat(largeReferenceLength)]
    ])

    await runPolls(1)

    expect(publishedIdsPerCall()).toEqual([[ids.first, ids.second], [ids.first], [ids.second]])
    for (const fileId of [ids.first, ids.second]) {
      const entry = await findEntry(fileId)
      expect(entry.status).toBe(SENT)
      expect(entry.attempts).toBe(1)
    }
    expect(publishFailedCalls()).toEqual([])
  })
})

describe('publishing a batch when SNS throttles the whole request', () => {
  test('returns every entry to PENDING with one attempt used, then sends them once SNS recovers', async () => {
    publishBatch.mockRejectedValueOnce(new ThrottledException({ message: 'Rate exceeded', $metadata: {} }))
    const ids = await seedEntries([
      ['first', 'normal reference one'],
      ['second', 'normal reference two']
    ])

    await runPolls(1)

    for (const fileId of [ids.first, ids.second]) {
      const entry = await findEntry(fileId)
      expect(entry.status).toBe(PENDING)
      expect(entry.attempts).toBe(1)
      expect(entry.error.code).toBe('ThrottledException')
    }
    expect(publishFailedCalls()).toEqual([{ value: 2, outcome: PUBLISH_FAILURE_OUTCOME.RETRYABLE }])

    await runPolls(1)

    for (const fileId of [ids.first, ids.second]) {
      const entry = await findEntry(fileId)
      expect(entry.status).toBe(SENT)
      expect(entry.attempts).toBe(2)
    }
    expect(failedAuditEntityIds()).toEqual([])
  })
})
