import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { config } from '../../../../src/config/index.js'
import { getDb, connectDb, closeDb } from '../../../../src/data/db.js'
import {
  claimProcessableOutboxEntries,
  finalizeClaimedOutboxEntries,
  getPendingOutboxMetrics,
  failExhaustedAbandonedOutboxEntries
} from '../../../../src/repos/outbox.js'
import { DELIVERY_OUTCOME, PENDING, PROCESSING, PERMANENT_FAILURE, SENT } from '../../../../src/constants/outbox.js'

let db

beforeAll(async () => {
  await connectDb()
  db = getDb()
})

afterAll(async () => {
  await closeDb()
})

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
  originalConfig.gracePeriodMs = config.get('messaging.outboxFailureGracePeriodMs')
})

beforeEach(async () => {
  config.set('mongo.outboxQueryLimit', 10)
  config.set('messaging.outboxMaxAttempts', 3)
  config.set('messaging.outboxClaimLeaseMs', 60000)
  config.set('messaging.outboxFailureGracePeriodMs', 30000)
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
  config.set('messaging.outboxFailureGracePeriodMs', originalConfig.gracePeriodMs)
})

describe('outbox claim repository concurrency', () => {
  test('concurrent workers claim non-overlapping entry sets', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    await db.collection(collectionName).insertMany(
      Array.from({ length: 20 }, (_, index) => buildEntry(testRunId, {
        createdAt: new Date(Date.UTC(2026, 7, 7, 10, 0, index))
      }))
    )

    const claimedById = new Map()
    // A single poll doesn't guarantee a fair split between concurrent workers (connection
    // pool checkout order can starve one side); the invariant under test is that claims
    // never overlap, so keep polling both workers until every entry is claimed.
    for (let round = 0; round < 10 && claimedById.size < 20; round++) {
      const [workerOneEntries, workerTwoEntries] = await Promise.all([
        claimProcessableOutboxEntries('worker-1'),
        claimProcessableOutboxEntries('worker-2')
      ])

      for (const entry of [...workerOneEntries, ...workerTwoEntries]) {
        const id = entry._id.toString()
        expect(claimedById.has(id)).toBe(false)
        claimedById.set(id, entry.claimedBy)
      }
    }

    expect(claimedById.size).toBe(20)
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

  test('does not claim a PERMANENT_FAILURE entry when attempts are below the limit', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    config.set('messaging.outboxMaxAttempts', 10)
    await db.collection(collectionName).insertOne(
      buildEntry(testRunId, { status: PERMANENT_FAILURE, attempts: 1 })
    )

    const claimed = await claimProcessableOutboxEntries('worker-1', now)

    expect(claimed).toEqual([])
  })

  test('increments attempts in the database at claim time', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    const { insertedId } = await db.collection(collectionName).insertOne(
      buildEntry(testRunId, { attempts: 1 })
    )

    const claimed = await claimProcessableOutboxEntries('worker-1', now)

    expect(claimed).toHaveLength(1)
    const persisted = await db.collection(collectionName).findOne({ _id: insertedId })
    expect(persisted.attempts).toBe(2)
  })

  test('excludes an entry from future claims once a reclaim pushes attempts to the limit', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    config.set('messaging.outboxMaxAttempts', 2)
    const { insertedId } = await db.collection(collectionName).insertOne(buildEntry(testRunId, {
      status: PROCESSING,
      attempts: 1,
      claimedBy: 'worker-old',
      claimedAt: new Date('2026-08-07T09:50:00.000Z'),
      claimedUntil: new Date('2026-08-07T09:55:00.000Z')
    }))

    // Simulates a crashed worker: the stale claim is reclaimed, incrementing attempts to the limit.
    const reclaimed = await claimProcessableOutboxEntries('worker-new', new Date('2026-08-07T10:00:00.000Z'))
    expect(reclaimed).toHaveLength(1)
    expect((await db.collection(collectionName).findOne({ _id: insertedId })).attempts).toBe(2)

    const subsequentClaim = await claimProcessableOutboxEntries('worker-newer', new Date('2026-08-07T10:10:00.000Z'))

    expect(subsequentClaim).toEqual([])
  })

  test('allows a new worker to reclaim a stale PROCESSING entry and only the new owner can finalize it', async () => {
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
    // A crashed worker never finalizes, so the reclaim's increment is the only record of that attempt.
    expect((await db.collection(collectionName).findOne({ _id: insertedId })).attempts).toBe(1)

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
    // Finalizing SUCCEEDED must not increment attempts again on top of the claim-time increment.
    expect((await db.collection(collectionName).findOne({ _id: insertedId })).attempts).toBe(1)
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
        attempts: 1,
        claimedBy: 'worker-1',
        claimedAt: now,
        claimedUntil
      }),
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
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

describe('getPendingOutboxMetrics', () => {
  test('returns zero count and null oldestCreatedAt for an empty collection', async () => {
    await expect(getPendingOutboxMetrics()).resolves.toEqual({ count: 0, oldestCreatedAt: null })
  })

  test('counts only PENDING and PROCESSING entries and returns the earliest of their createdAt values', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const oldestPendingAt = new Date(Date.UTC(2026, 7, 7, 10, 0, 2))
    await db.collection(collectionName).insertMany([
      buildEntry(testRunId, { status: SENT, createdAt: new Date(Date.UTC(2026, 7, 7, 10, 0, 0)) }),
      buildEntry(testRunId, { status: PERMANENT_FAILURE, createdAt: new Date(Date.UTC(2026, 7, 7, 10, 0, 1)) }),
      buildEntry(testRunId, { status: PENDING, createdAt: oldestPendingAt }),
      buildEntry(testRunId, { status: PROCESSING, createdAt: new Date(Date.UTC(2026, 7, 7, 10, 0, 3)) })
    ])

    await expect(getPendingOutboxMetrics()).resolves.toEqual({ count: 2, oldestCreatedAt: oldestPendingAt })
  })

  test('returns the oldest createdAt from a PROCESSING entry when it predates PENDING entries', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const oldestProcessingAt = new Date(Date.UTC(2026, 7, 7, 10, 0, 0))
    await db.collection(collectionName).insertMany([
      buildEntry(testRunId, { status: PENDING, createdAt: new Date(Date.UTC(2026, 7, 7, 10, 0, 5)) }),
      buildEntry(testRunId, { status: PROCESSING, createdAt: oldestProcessingAt })
    ])

    await expect(getPendingOutboxMetrics()).resolves.toEqual({ count: 2, oldestCreatedAt: oldestProcessingAt })
  })
})

describe('failExhaustedAbandonedOutboxEntries sweep integration', () => {
  test('marks PROCESSING entries with expired claims and exhausted attempts as PERMANENT_FAILURE', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    const expiredClaimedUntil = new Date('2026-08-07T09:50:00.000Z')
    const { insertedId } = await db.collection(collectionName).insertOne(
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: expiredClaimedUntil
      })
    )

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(result).toHaveLength(1)
    expect(result[0]._id).toEqual(insertedId)
    expect(result[0].status).toBe(PERMANENT_FAILURE)
    expect(result[0].lastAttemptedAt).toEqual(now)
    expect(result[0]).not.toHaveProperty('claimedBy')
    expect(result[0]).not.toHaveProperty('claimedAt')
    expect(result[0]).not.toHaveProperty('claimedUntil')
  })

  test('respects grace period: does not fail entry until (claimedUntil + gracePeriod) passes', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    // Grace period is 30000ms (30 seconds)
    const claimedUntil = new Date('2026-08-07T09:59:00.000Z')
    const beforeGracePeriod = new Date('2026-08-07T09:59:20.000Z') // 20 seconds after claimedUntil, inside the grace period
    const afterGracePeriod = new Date('2026-08-07T10:00:35.000Z') // 95 seconds after claimedUntil, past the grace period

    await db.collection(collectionName).insertOne(
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:50:00.000Z'),
        claimedUntil
      })
    )

    // Before grace period passes, entry should NOT be marked as PERMANENT_FAILURE
    let result = await failExhaustedAbandonedOutboxEntries('worker-sweep', beforeGracePeriod)
    expect(result).toHaveLength(0)

    // After grace period passes, entry should be marked as PERMANENT_FAILURE
    result = await failExhaustedAbandonedOutboxEntries('worker-sweep', afterGracePeriod)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe(PERMANENT_FAILURE)
  })

  test('does not fail PROCESSING entries with active claims', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    await db.collection(collectionName).insertOne(
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-active',
        claimedAt: new Date('2026-08-07T09:55:00.000Z'),
        claimedUntil: new Date('2026-08-07T10:05:00.000Z')
      })
    )

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(result).toHaveLength(0)
  })

  test('does not fail PROCESSING entries that have not exhausted attempts', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    await db.collection(collectionName).insertOne(
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 1,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z')
      })
    )

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(result).toHaveLength(0)
  })

  test('respects queryLimit for bounded iteration', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    config.set('mongo.outboxQueryLimit', 2)

    await db.collection(collectionName).insertMany([
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z'),
        createdAt: new Date('2026-08-07T09:00:00.000Z')
      }),
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z'),
        createdAt: new Date('2026-08-07T09:01:00.000Z')
      }),
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z'),
        createdAt: new Date('2026-08-07T09:02:00.000Z')
      })
    ])

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(result).toHaveLength(2)
  })

  test('allows next poll to complete the work when interrupted by queryLimit', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    config.set('mongo.outboxQueryLimit', 1)

    await db.collection(collectionName).insertMany([
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z'),
        createdAt: new Date('2026-08-07T09:00:00.000Z')
      }),
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z'),
        createdAt: new Date('2026-08-07T09:01:00.000Z')
      })
    ])

    // First sweep processes one entry
    let result = await failExhaustedAbandonedOutboxEntries('worker-sweep-1', now)
    expect(result).toHaveLength(1)

    // Check that the other entry still exists in PROCESSING state
    const remaining = await db.collection(collectionName).findOne({
      testRunId,
      status: PROCESSING
    })
    expect(remaining).not.toBeNull()

    // Second sweep processes the remaining entry
    result = await failExhaustedAbandonedOutboxEntries('worker-sweep-2', now)
    expect(result).toHaveLength(1)

    // Both entries are now PERMANENT_FAILURE
    const finalState = await db.collection(collectionName)
      .find({ testRunId })
      .toArray()
    expect(finalState).toHaveLength(2)
    expect(finalState.every(e => e.status === PERMANENT_FAILURE)).toBe(true)
  })

  test('concurrent sweeps do not overlap when processing expired entries', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    config.set('mongo.outboxQueryLimit', 10)

    await db.collection(collectionName).insertMany([
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z'),
        createdAt: new Date('2026-08-07T09:00:00.000Z')
      }),
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z'),
        createdAt: new Date('2026-08-07T09:01:00.000Z')
      }),
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z'),
        createdAt: new Date('2026-08-07T09:02:00.000Z')
      })
    ])

    // Run two sweeps concurrently
    const [result1, result2] = await Promise.all([
      failExhaustedAbandonedOutboxEntries('worker-sweep-1', now),
      failExhaustedAbandonedOutboxEntries('worker-sweep-2', now)
    ])

    // Combined they process all 3 entries without overlap
    const allProcessed = [...result1, ...result2]
    expect(allProcessed).toHaveLength(3)

    // No entry appears in both results
    const ids1 = new Set(result1.map(e => e._id.toString()))
    const ids2 = new Set(result2.map(e => e._id.toString()))
    expect(ids1.size + ids2.size).toBe(3)

    // All entries are marked as PERMANENT_FAILURE
    const finalState = await db.collection(collectionName)
      .find({ testRunId })
      .toArray()
    expect(finalState.every(e => e.status === PERMANENT_FAILURE)).toBe(true)
  })

  test('leaves remaining entries untouched when stopped midway, allowing next poll to complete', async () => {
    const testRunId = `${testRunPrefix}${randomUUID()}`
    const now = new Date('2026-08-07T10:00:00.000Z')
    config.set('mongo.outboxQueryLimit', 1)

    await db.collection(collectionName).insertMany([
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z'),
        createdAt: new Date('2026-08-07T09:00:00.000Z')
      }),
      buildEntry(testRunId, {
        status: PROCESSING,
        attempts: 3,
        claimedBy: 'worker-old',
        claimedAt: new Date('2026-08-07T09:40:00.000Z'),
        claimedUntil: new Date('2026-08-07T09:50:00.000Z'),
        createdAt: new Date('2026-08-07T09:01:00.000Z')
      })
    ])

    // First poll processes one entry
    const result1 = await failExhaustedAbandonedOutboxEntries('worker-1', now)
    expect(result1).toHaveLength(1)

    // The unprocessed entry still matches the filter and is in PROCESSING state
    const remaining = await db.collection(collectionName).findOne({
      _id: { $nin: result1.map(e => e._id) },
      testRunId,
      status: PROCESSING,
      attempts: { $gte: 3 }
    })
    expect(remaining).not.toBeNull()

    // Next poll continues from where the first stopped
    const result2 = await failExhaustedAbandonedOutboxEntries('worker-2', now)
    expect(result2).toHaveLength(1)
    expect(result2[0]._id.toString()).not.toBe(result1[0]._id.toString())
  })
})
