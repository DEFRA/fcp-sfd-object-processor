import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  loggerWarn: vi.fn(),
  configGet: vi.fn((key) => {
    switch (key) {
      case 'mongo.collections.outbox': return 'outbox'
      case 'mongo.outboxQueryLimit': return 2
      case 'messaging.outboxMaxAttempts': return 3
      case 'messaging.outboxClaimLeaseMs': return 300000
      default: return null
    }
  })
}))

vi.mock('../../../src/config/index.js', () => ({
  config: { get: mocks.configGet }
}))

vi.mock('../../../src/data/db.js', () => ({
  db: { collection: mocks.collection }
}))

vi.mock('../../../src/logging/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: mocks.loggerWarn })
}))

vi.mock('../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: vi.fn()
}))

const {
  claimProcessableOutboxEntries,
  finalizeClaimedOutboxEntries
} = await import('../../../src/repos/outbox.js')

describe('outbox claims', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('atomically claims eligible entries oldest first up to the query limit', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const claimedUntil = new Date('2026-08-07T10:05:00.000Z')
    const findOneAndUpdate = vi.fn()
      .mockResolvedValueOnce({ _id: 'entry-1', status: 'PENDING', createdAt: new Date('2026-08-07T09:00:00.000Z') })
      .mockResolvedValueOnce({ _id: 'entry-2', status: 'PENDING', createdAt: new Date('2026-08-07T09:01:00.000Z') })
    mocks.collection.mockReturnValue({ findOneAndUpdate })

    const result = await claimProcessableOutboxEntries('worker-1', now)

    expect(findOneAndUpdate).toHaveBeenCalledTimes(2)
    expect(findOneAndUpdate).toHaveBeenCalledWith({
      attempts: { $lt: 3 },
      $or: [
        { status: 'PENDING' },
        { status: 'PROCESSING', claimedUntil: { $lt: now } }
      ]
    }, {
      $set: {
        status: 'PROCESSING',
        claimedAt: now,
        claimedUntil,
        claimedBy: 'worker-1'
      }
    }, {
      sort: { createdAt: 1 },
      returnDocument: 'before'
    })
    expect(result).toEqual([
      expect.objectContaining({ _id: 'entry-1', status: 'PROCESSING', claimedBy: 'worker-1', claimedUntil }),
      expect.objectContaining({ _id: 'entry-2', status: 'PROCESSING', claimedBy: 'worker-1', claimedUntil })
    ])
  })

  test('stops claiming when no eligible entry remains', async () => {
    const findOneAndUpdate = vi.fn()
      .mockResolvedValueOnce({ _id: 'entry-1', status: 'PENDING' })
      .mockResolvedValueOnce(null)
    mocks.collection.mockReturnValue({ findOneAndUpdate })

    const result = await claimProcessableOutboxEntries('worker-1')

    expect(result).toHaveLength(1)
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2)
  })

  test('logs when an expired processing claim is reclaimed', async () => {
    const expiredClaim = {
      _id: { toString: () => 'entry-1' },
      status: 'PROCESSING',
      payload: { file: { fileId: 'file-1' }, messaging: { correlationId: 'correlation-1' } },
      claimedBy: 'worker-old',
      claimedUntil: new Date('2026-08-07T09:59:00.000Z')
    }
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce(expiredClaim)
        .mockResolvedValueOnce(null)
    })

    await claimProcessableOutboxEntries('worker-new', new Date('2026-08-07T10:00:00.000Z'))

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_claim_reclaimed',
          action: 'reclaim_expired_claim',
          reference: 'entry-1',
          outcome: 'success',
          created: new Date('2026-08-07T10:00:00.000Z'),
          duration: 300000000000,
          reason: 'expired_claim previousOwner=worker-old previousClaimedUntil=2026-08-07T09:59:00.000Z'
        },
        process: { name: 'worker-new' }
      },
      'Reclaimed expired outbox claim; entryId=file-1'
    )
  })

  test('finalizes successful entries only while the worker owns a valid claim', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 2 })
    mocks.collection.mockReturnValue({ updateMany })
    const session = { id: 'session-1' }

    const result = await finalizeClaimedOutboxEntries(
      session,
      ['entry-1', 'entry-2'],
      'worker-1',
      'SENT',
      null,
      now
    )

    expect(updateMany).toHaveBeenCalledWith({
      _id: { $in: ['entry-1', 'entry-2'] },
      status: 'PROCESSING',
      claimedBy: 'worker-1',
      claimedUntil: { $gt: now }
    }, {
      $set: { status: 'SENT', lastAttemptedAt: now },
      $inc: { attempts: 1 },
      $unset: { claimedAt: '', claimedUntil: '', claimedBy: '', error: '' }
    }, { session })
    expect(result.matchedCount).toBe(2)
  })

  test('finalizes failed attempts with retry and terminal status pipeline', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    mocks.collection.mockReturnValue({ updateMany })

    await finalizeClaimedOutboxEntries(
      null,
      ['entry-1'],
      'worker-1',
      'FAILED',
      'SNS unavailable',
      now
    )

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      status: 'PROCESSING',
      claimedBy: 'worker-1',
      claimedUntil: { $gt: now }
    }), [
      {
        $set: {
          attempts: { $add: [{ $ifNull: ['$attempts', 0] }, 1] },
          lastAttemptedAt: now,
          error: 'SNS unavailable'
        }
      },
      {
        $set: {
          status: { $cond: [{ $gte: ['$attempts', 3] }, 'FAILED', 'PENDING'] }
        }
      },
      { $unset: ['claimedAt', 'claimedUntil', 'claimedBy'] }
    ], {})
  })

  test('rejects an unsupported delivery status', async () => {
    mocks.collection.mockReturnValue({ updateMany: vi.fn() })

    await expect(finalizeClaimedOutboxEntries(
      null,
      ['entry-1'],
      'worker-1',
      'PROCESSING'
    )).rejects.toThrow('Unsupported outbox delivery status: PROCESSING')
  })

  test('throws when finalization is not acknowledged', async () => {
    mocks.collection.mockReturnValue({
      updateMany: vi.fn().mockResolvedValue({ acknowledged: false })
    })

    await expect(finalizeClaimedOutboxEntries(
      null,
      ['entry-1'],
      'worker-1',
      'SENT'
    )).rejects.toThrow('Failed to finalize claimed outbox entries')
  })
})
