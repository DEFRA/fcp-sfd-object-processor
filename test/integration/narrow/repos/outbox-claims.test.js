import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { config } from '../../../../src/config/index.js'
import { db } from '../../../../src/data/db.js'
import {
  claimProcessableOutboxEntries,
  finalizeClaimedOutboxEntries
} from '../../../../src/repos/outbox.js'
import { DELIVERY_OUTCOME, PENDING, PROCESSING, PERMANENT_FAILURE } from '../../../../src/constants/outbox.js'

const originalCollectionName = config.get('mongo.collections.outbox')
const collectionName = `${originalCollectionName}-claims-integration`
const testRunPrefix = 'outbox-claims-'
const originalConfig = {}

const buildEntry = (testRunId, overrides = {}) => ({
  testRunId,
  messageId: randomUUID(),
  payload: {
    file: { fileId: randomUUID() },
    messaging: { correlationId: randomUUID() }
  },
  status: PENDING,
  attempts: 0,
  createdAt: new Date(),
  ...overrides
})

beforeAll(() => {
  config.set('mongo.collections.outbox', collectionName)
  originalConfig.queryLimit = config.get('mongo.outboxQueryLimit')
  originalConfig.maxAttempts = config.get('messaging.outboxMaxAttempts')
  originalConfig.claimLeaseMs = config.get('messaging.outboxClaimLeaseMs')
})

beforeEach(async () => {
  config.set('mongo.outboxQueryLimit', 10)
  config.set('messaging.outboxMaxAttempts', 3)
  config.set('messaging.outboxClaimLeaseMs', 60000)
  await db.collection(collectionName).deleteMany({ testRunId: { $regex: `^${testRunPrefix}` } })
})

afterEach(async () => {
  await db.collection(collectionName).deleteMany({ testRunId: { $regex: `^${testRunPrefix}` } })
})

afterAll(async () => {
  await db.collection(collectionName).deleteMany({})
  config.set('mongo.collections.outbox', originalCollectionName)
  config.set('mongo.outboxQueryLimit', originalConfig.queryLimit)
  config.set('messaging.outboxMaxAttempts', originalConfig.maxAttempts)
  config.set('messaging.outboxClaimLeaseMs', originalConfig.claimLeaseMs)
})

describe('outbox claim repository concurrency', () => {
  test('concurrent workers claim non-overlapping entry sets', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    await db.collection(collectionName).insertMany(
      Array.from({ length: 20 }, (_, index) => buildEntry(testRunId, {
        createdAt: new Date(Date.UTC(2026, 7, 7, 10, 0, index))
      }))
    )

    const [workerOneEntries, workerTwoEntries] = await Promise.all([
      claimProcessableOutboxEntries('worker-1'),
      claimProcessableOutboxEntries('worker-2')
    ])

    const workerOneIds = new Set(workerOneEntries.map(entry => entry._id.toString()))
    const workerTwoIds = new Set(workerTwoEntries.map(entry => entry._id.toString()))
    const overlap = [...workerOneIds].filter(id => workerTwoIds.has(id))

    expect(workerOneEntries).toHaveLength(10)
    expect(workerTwoEntries).toHaveLength(10)
    expect(overlap).toEqual([])
    expect(new Set([...workerOneIds, ...workerTwoIds]).size).toBe(20)
  })

  test('does not claim active processing or terminal failed entries', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    await db.collection(collectionName).insertMany([
      buildEntry(testRunId, {
        status: PROCESSING,
        claimedBy: 'worker-1',
        claimedAt: new Date('2026-08-07T09:59:00.000Z'),
        claimedUntil: new Date('2026-08-07T10:01:00.000Z')
      }),
      buildEntry(testRunId, { status: PERMANENT_FAILURE, attempts: 3 })
    ])

    const claimed = await claimProcessableOutboxEntries('worker-2', now)

    expect(claimed).toEqual([])
  })

  test('reclaims an expired entry and prevents the previous owner finalizing it', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const reclaimTime = new Date('2026-08-07T10:00:00.000Z')
    const { insertedId } = await db.collection(collectionName).insertOne(buildEntry(testRunId, {
      status: PROCESSING,
      claimedBy: 'worker-old',
      claimedAt: new Date('2026-08-07T09:50:00.000Z'),
      claimedUntil: new Date('2026-08-07T09:55:00.000Z')
    }))

    config.set('mongo.outboxQueryLimit', 1)
    const reclaimed = await claimProcessableOutboxEntries('worker-new', reclaimTime)
    const staleResult = await finalizeClaimedOutboxEntries(
      null,
      [insertedId],
      'worker-old',
      DELIVERY_OUTCOME.SUCCEEDED,
      null,
      new Date('2026-08-07T10:00:01.000Z')
    )
    const ownerResult = await finalizeClaimedOutboxEntries(
      null,
      [insertedId],
      'worker-new',
      DELIVERY_OUTCOME.SUCCEEDED,
      null,
      new Date('2026-08-07T10:00:01.000Z')
    )

    expect(reclaimed).toHaveLength(1)
    expect(reclaimed[0]).toMatchObject({ _id: insertedId, claimedBy: 'worker-new', status: PROCESSING })
    expect(staleResult.matchedCount).toBe(0)
    expect(ownerResult.matchedCount).toBe(1)
  })

  test('does not allow an owner to finalize its own expired claim', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const { insertedId } = await db.collection(collectionName).insertOne(buildEntry(testRunId, {
      status: PROCESSING,
      claimedBy: 'worker-1',
      claimedAt: new Date('2026-08-07T09:50:00.000Z'),
      claimedUntil: new Date('2026-08-07T09:55:00.000Z')
    }))

    const result = await finalizeClaimedOutboxEntries(
      null,
      [insertedId],
      'worker-1',
      DELIVERY_OUTCOME.SUCCEEDED,
      null,
      new Date('2026-08-07T10:00:00.000Z')
    )

    expect(result.matchedCount).toBe(0)
    expect(await db.collection(collectionName).findOne({ _id: insertedId })).toMatchObject({
      status: PROCESSING,
      claimedBy: 'worker-1'
    })
  })

  test('returns retryable failures to pending and makes exhausted failures terminal', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    const claimedUntil = new Date('2026-08-07T10:05:00.000Z')
    const { insertedIds } = await db.collection(collectionName).insertMany([
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 0,
        claimedBy: 'worker-1',
        claimedAt: now,
        claimedUntil
      }),
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 2,
        claimedBy: 'worker-1',
        claimedAt: now,
        claimedUntil
      })
    ])

    const result = await finalizeClaimedOutboxEntries(
      null,
      Object.values(insertedIds),
      'worker-1',
      DELIVERY_OUTCOME.FAILED,
      'SNS unavailable',
      new Date('2026-08-07T10:01:00.000Z')
    )
    const entries = await db.collection(collectionName)
      .find({ testRunId })
      .sort({ attempts: 1 })
      .toArray()

    expect(result.matchedCount).toBe(2)
    expect(entries[0]).toMatchObject({ status: PENDING, attempts: 1, error: 'SNS unavailable' })
    expect(entries[1]).toMatchObject({ status: PERMANENT_FAILURE, attempts: 3, error: 'SNS unavailable' })
    expect(entries[0]).not.toHaveProperty('claimedBy')
    expect(entries[1]).not.toHaveProperty('claimedBy')
  })
})
