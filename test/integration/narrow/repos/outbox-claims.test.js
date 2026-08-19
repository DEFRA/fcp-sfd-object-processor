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
