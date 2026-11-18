import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DELIVERY_OUTCOME } from '../../../../src/constants/outbox.js'

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  configGet: vi.fn((key) => {
    switch (key) {
      case 'mongo.collections.outbox': return 'outbox'
      case 'mongo.outboxQueryLimit': return 2
      case 'messaging.outboxMaxAttempts': return 3
      case 'messaging.outboxClaimLeaseMs': return 300000
      case 'messaging.outboxFailureGracePeriodMs': return 30000
      default: return null
    }
  }),
  sendAuditEvent: vi.fn()
}))

vi.mock('../../../src/config/index.js', () => ({
  config: { get: mocks.configGet }
}))

vi.mock('../../../src/data/db.js', () => {
  const db = { collection: mocks.collection }
  return { getDb: () => db }
})

vi.mock('../../../src/logging/logger.js', () => ({
  createLogger: () => ({ error: mocks.loggerError, info: vi.fn(), warn: mocks.loggerWarn })
}))

vi.mock('../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: mocks.sendAuditEvent
}))

const {
  claimProcessableOutboxEntries,
  finalizeClaimedOutboxEntries,
  getPendingOutboxMetrics,
  failExhaustedAbandonedOutboxEntries
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
      },
      $inc: { attempts: 1 }
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

  test('does not reclaim a PERMANENT_FAILURE entry even when attempts are below the limit', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const permanentFailureDoc = { status: 'PERMANENT_FAILURE', attempts: 1 }
    // Mirrors Mongo's own filter matching so this proves the $or on status - not attempts - excludes the doc.
    const findOneAndUpdate = vi.fn().mockImplementation((filter) => {
      const matchesStatus = filter.$or.some(condition => condition.status === permanentFailureDoc.status)
      const matchesAttempts = permanentFailureDoc.attempts < filter.attempts.$lt
      return Promise.resolve(matchesStatus && matchesAttempts ? permanentFailureDoc : null)
    })
    mocks.collection.mockReturnValue({ findOneAndUpdate })

    const result = await claimProcessableOutboxEntries('worker-1', now)

    expect(result).toEqual([])
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
        process: { name: 'worker-new' },
        tenant: { message: null }
      },
      'Reclaimed expired outbox claim; entryId=file-1'
    )
  })

  describe('source system in tenant.message', () => {
    test('includes sourceSystem in the reclaimed claim log line when present', async () => {
      const expiredClaim = {
        _id: { toString: () => 'entry-src' },
        status: 'PROCESSING',
        payload: {
          file: { fileId: 'file-src' },
          metadata: { service: 'rps-portal' },
          messaging: { correlationId: 'correlation-src' }
        },
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
        expect.objectContaining({ tenant: { message: 'sourceSystem=rps-portal' } }),
        expect.any(String)
      )
    })

    test('omits sourceSystem in the reclaimed claim log line when absent', async () => {
      const expiredClaim = {
        _id: { toString: () => 'entry-nosrc' },
        status: 'PROCESSING',
        payload: {
          file: { fileId: 'file-nosrc' },
          messaging: { correlationId: 'correlation-nosrc' }
        },
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
        expect.objectContaining({ tenant: { message: null } }),
        expect.any(String)
      )
    })
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
      DELIVERY_OUTCOME.SUCCEEDED,
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
      $unset: { claimedAt: '', claimedUntil: '', claimedBy: '', error: '' }
    }, { session })
    expect(result.matchedCount).toBe(2)
  })

  test('finalizes failed attempts with retry and terminal status pipeline', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1 })
    mocks.collection.mockReturnValue({ updateMany })

    const result = await finalizeClaimedOutboxEntries(
      null,
      ['entry-1'],
      'worker-1',
      DELIVERY_OUTCOME.FAILED,
      'SNS unavailable',
      now
    )

    expect(updateMany).toHaveBeenCalledWith(
      {
        _id: { $in: ['entry-1'] },
        status: 'PROCESSING',
        claimedBy: 'worker-1',
        claimedUntil: { $gt: now }
      },
      [
        {
          $set: {
            lastAttemptedAt: now,
            error: 'SNS unavailable'
          }
        },
        {
          $set: {
            status: { $cond: [{ $gte: ['$attempts', 3] }, 'PERMANENT_FAILURE', 'PENDING'] }
          }
        },
        { $unset: ['claimedAt', 'claimedUntil', 'claimedBy'] }
      ],
      {}
    )
    expect(result).toEqual({ acknowledged: true, matchedCount: 1 })
  })

  test('returns matchedCount 0 when FAILED entry claim has expired', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 0 })
    mocks.collection.mockReturnValue({ updateMany })

    const result = await finalizeClaimedOutboxEntries(null, ['entry-1'], 'worker-1', DELIVERY_OUTCOME.FAILED, null, now)

    expect(result).toEqual({ acknowledged: true, matchedCount: 0 })
  })

  test('rejects an unsupported delivery outcome', async () => {
    mocks.collection.mockReturnValue({ updateMany: vi.fn() })

    await expect(finalizeClaimedOutboxEntries(
      null,
      ['entry-1'],
      'worker-1',
      'PROCESSING'
    )).rejects.toThrow('Unsupported delivery outcome: PROCESSING')
  })

  test('throws when finalization is not acknowledged', async () => {
    mocks.collection.mockReturnValue({
      updateMany: vi.fn().mockResolvedValue({ acknowledged: false })
    })

    await expect(finalizeClaimedOutboxEntries(
      null,
      ['entry-1'],
      'worker-1',
      DELIVERY_OUTCOME.SUCCEEDED
    )).rejects.toThrow('Failed to finalize claimed outbox entries')
  })

  test('throws when failed-attempt finalization is not acknowledged', async () => {
    mocks.collection.mockReturnValue({
      updateMany: vi.fn().mockResolvedValue({ acknowledged: false })
    })

    await expect(finalizeClaimedOutboxEntries(
      null,
      ['entry-1'],
      'worker-1',
      DELIVERY_OUTCOME.FAILED
    )).rejects.toThrow('Failed to finalize claimed outbox entries')
  })
})

describe('failExhaustedAbandonedOutboxEntries sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('marks PROCESSING entries with expired claims and exhausted attempts as PERMANENT_FAILURE', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const failureThreshold = new Date(now.getTime() - 30000)
    const updatedEntry = {
      _id: 'entry-1',
      status: 'PERMANENT_FAILURE',
      payload: {
        file: { fileId: 'file-1' },
        messaging: { correlationId: 'corr-1' },
        metadata: { crn: 123456789 }
      },
      attempts: 3,
      lastAttemptedAt: now
    }
    const findOneAndUpdate = vi.fn()
      .mockResolvedValueOnce(updatedEntry)
      .mockResolvedValueOnce(null)
    mocks.collection.mockReturnValue({ findOneAndUpdate })

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(findOneAndUpdate).toHaveBeenCalledWith({
      status: 'PROCESSING',
      claimedUntil: { $lt: failureThreshold },
      attempts: { $gte: 3 }
    }, {
      $set: {
        status: 'PERMANENT_FAILURE',
        lastAttemptedAt: now
      },
      $unset: {
        claimedAt: '',
        claimedUntil: '',
        claimedBy: ''
      }
    }, { returnDocument: 'after' })
    expect(result).toEqual([updatedEntry])
  })

  test('applies grace period to claim expiry time', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const failureThreshold = new Date('2026-08-07T09:59:30.000Z')
    mocks.collection.mockReturnValue({ findOneAndUpdate: vi.fn().mockResolvedValueOnce(null) })

    await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(mocks.collection().findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        claimedUntil: { $lt: failureThreshold }
      }),
      expect.any(Object),
      expect.any(Object)
    )
  })

  test('stops sweeping when no entry matches', async () => {
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn().mockResolvedValueOnce(null)
    })

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep')

    expect(result).toEqual([])
    expect(mocks.collection().findOneAndUpdate).toHaveBeenCalledTimes(1)
  })

  test('respects queryLimit for bounded iteration', async () => {
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce({ _id: 'entry-1', status: 'PERMANENT_FAILURE' })
        .mockResolvedValueOnce({ _id: 'entry-2', status: 'PERMANENT_FAILURE' })
        .mockResolvedValueOnce({ _id: 'entry-3', status: 'PERMANENT_FAILURE' })
    })

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep')

    // queryLimit is set to 2 in mocks
    expect(result).toHaveLength(2)
    expect(mocks.collection().findOneAndUpdate).toHaveBeenCalledTimes(2)
  })

  test('emits terminal failure log and audit events for each updated entry', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const updatedEntry = {
      _id: { toString: () => 'entry-id-1' },
      status: 'PERMANENT_FAILURE',
      payload: {
        file: { fileId: 'file-1' },
        messaging: { correlationId: 'corr-1' },
        metadata: { crn: 123456789, sbi: 123456, service: 'fcp-sfd-frontend' }
      },
      attempts: 3,
      lastAttemptedAt: now
    }
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce(updatedEntry)
        .mockResolvedValueOnce(null)
    })
    mocks.sendAuditEvent.mockResolvedValue({})

    await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    // Check that terminal failure log was emitted
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'outbox_terminal_failure',
          reason: 'claim expired at maximum attempts'
        }),
        process: { name: 'worker-sweep' },
        error: expect.objectContaining({
          type: 'outbox_terminal_failure',
          id: 'file-1',
          message: 'claim expired at maximum attempts'
        })
      }),
      expect.stringContaining('entryId=file-1; attempt=3')
    )

    // Check that audit event was sent
    expect(mocks.sendAuditEvent).toHaveBeenCalledWith({
      correlationid: 'corr-1',
      audit: expect.objectContaining({
        entities: [{ entity: 'document', action: 'failed', entityid: 'file-1' }],
        status: 'failure',
        details: { reason: 'claim expired at maximum attempts', attempts: 3 }
      })
    })
  })

  test('does not stop poll when audit event fails', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const updatedEntry = {
      _id: 'entry-1',
      status: 'PERMANENT_FAILURE',
      payload: {
        file: { fileId: 'file-1' },
        messaging: { correlationId: 'corr-1' },
        metadata: { crn: 123456789, sbi: 123456 }
      },
      attempts: 3
    }
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce(updatedEntry)
        .mockResolvedValueOnce(null)
    })
    // Simulate audit event failure
    mocks.sendAuditEvent.mockRejectedValue(new Error('Audit service unavailable'))

    // Should not throw even though audit failed
    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(result).toHaveLength(1)
    expect(mocks.loggerError).toHaveBeenCalled()
    expect(mocks.sendAuditEvent).toHaveBeenCalled()
  })

  test('returns only documents changed in this invocation', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const entry1 = {
      _id: 'entry-1',
      status: 'PERMANENT_FAILURE',
      payload: {
        file: { fileId: 'file-1' },
        messaging: { correlationId: 'corr-1' },
        metadata: { crn: 123456789, sbi: 123456 }
      },
      attempts: 3
    }
    const entry2 = {
      _id: 'entry-2',
      status: 'PERMANENT_FAILURE',
      payload: {
        file: { fileId: 'file-2' },
        messaging: { correlationId: 'corr-2' },
        metadata: { crn: 987654321, sbi: 654321 }
      },
      attempts: 3
    }
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce(entry1)
        .mockResolvedValueOnce(entry2)
        .mockResolvedValueOnce(null)
    })
    mocks.sendAuditEvent.mockResolvedValue({})

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(result).toEqual([entry1, entry2])
    expect(result).toHaveLength(2)
  })

  test('includes error code in log and audit when entry has error.code', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const entryWithError = {
      _id: { toString: () => 'entry-error' },
      status: 'PERMANENT_FAILURE',
      payload: {
        file: { fileId: 'file-error' },
        messaging: { correlationId: 'corr-error' },
        metadata: { crn: 123456789, sbi: 123456 }
      },
      attempts: 3,
      error: { code: 'SNSThrottled', message: 'Rate exceeded' }
    }
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce(entryWithError)
        .mockResolvedValueOnce(null)
    })
    mocks.sendAuditEvent.mockResolvedValue({})

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(result).toHaveLength(1)
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          type: 'outbox_terminal_failure',
          id: 'file-error',
          code: 'SNSThrottled',
          message: 'Rate exceeded'
        })
      }),
      expect.any(String)
    )
    expect(mocks.sendAuditEvent).toHaveBeenCalledWith({
      correlationid: 'corr-error',
      audit: expect.objectContaining({
        details: { reason: 'Rate exceeded', code: 'SNSThrottled', attempts: 3 }
      })
    })
  })

  test('allows concurrent sweeps to process without overlap due to atomic filter-update', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const entry1 = {
      _id: 'entry-1',
      status: 'PERMANENT_FAILURE',
      payload: {
        file: { fileId: 'file-1' },
        messaging: { correlationId: 'corr-1' },
        metadata: { crn: 123456789, sbi: 123456 }
      },
      attempts: 3
    }
    const entry2 = {
      _id: 'entry-2',
      status: 'PERMANENT_FAILURE',
      payload: {
        file: { fileId: 'file-2' },
        messaging: { correlationId: 'corr-2' },
        metadata: { crn: 987654321, sbi: 654321 }
      },
      attempts: 3
    }

    // Simulate atomic behavior where each findOneAndUpdate atomically claims an entry
    // Once claimed, subsequent calls return null for that entry even from different sweeps
    const availableEntries = [entry1, entry2]
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn(async () => {
        if (availableEntries.length > 0) {
          return availableEntries.shift()
        }
        return null
      })
    })
    mocks.sendAuditEvent.mockResolvedValue({})

    const sweep1Promise = failExhaustedAbandonedOutboxEntries('worker-1', now)
    const sweep2Promise = failExhaustedAbandonedOutboxEntries('worker-2', now)

    const [result1, result2] = await Promise.all([sweep1Promise, sweep2Promise])

    // Each sweep processes its own entries; the atomic filter-update ensures no overlap
    expect(result1).toHaveLength(1)
    expect(result2).toHaveLength(1)
    expect(result1[0]._id).not.toBe(result2[0]._id)
  })

  test('handles entries without file metadata', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const entryWithoutFile = {
      _id: { toString: () => 'entry-nofile' },
      status: 'PERMANENT_FAILURE',
      payload: {
        file: {}, // Missing fileId
        messaging: { correlationId: 'corr-nofile' },
        metadata: { crn: 123456789 }
      },
      attempts: 3
    }
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce(entryWithoutFile)
        .mockResolvedValueOnce(null)
    })
    mocks.sendAuditEvent.mockResolvedValue({})

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(result).toHaveLength(1)
    // Verify audit event still gets called with fallback entityid
    expect(mocks.sendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          entities: [expect.objectContaining({ entityid: 'entry-nofile' })]
        })
      })
    )
  })

  test('handles entries without messaging correlationId', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const entryWithoutCorr = {
      _id: { toString: () => 'entry-nocorr' },
      status: 'PERMANENT_FAILURE',
      payload: {
        file: { fileId: 'file-nocorr' },
        messaging: {}, // Missing correlationId
        metadata: { crn: 123456789 }
      },
      attempts: 3
    }
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce(entryWithoutCorr)
        .mockResolvedValueOnce(null)
    })
    mocks.sendAuditEvent.mockResolvedValue({})

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(result).toHaveLength(1)
    // Verify audit event is still called even without correlationId
    expect(mocks.sendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationid: undefined
      })
    )
  })

  test('handles entries without error or metadata', async () => {
    const now = new Date('2026-08-07T10:00:00.000Z')
    const minimalEntry = {
      _id: { toString: () => 'entry-minimal' },
      status: 'PERMANENT_FAILURE',
      payload: {
        file: { fileId: 'file-minimal' }
      },
      attempts: 3
    }
    mocks.collection.mockReturnValue({
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce(minimalEntry)
        .mockResolvedValueOnce(null)
    })
    mocks.sendAuditEvent.mockResolvedValue({})

    const result = await failExhaustedAbandonedOutboxEntries('worker-sweep', now)

    expect(result).toHaveLength(1)
    // Verify log was emitted with reason fallback
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'claim expired at maximum attempts'
        })
      }),
      expect.any(String)
    )
  })
})

describe('getPendingOutboxMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns count and oldest pending entry timestamp', async () => {
    const oldestCreatedAt = new Date('2026-08-07T09:00:00.000Z')
    const next = vi.fn().mockResolvedValue({ createdAt: oldestCreatedAt })
    const project = vi.fn().mockReturnValue({ next })
    const limit = vi.fn().mockReturnValue({ project })
    const sort = vi.fn().mockReturnValue({ limit })
    const find = vi.fn().mockReturnValue({ sort })
    const aggregate = vi.fn().mockReturnValue({ next: vi.fn().mockResolvedValue({ n: 3 }) })
    mocks.collection.mockReturnValue({ aggregate, find })

    await expect(getPendingOutboxMetrics()).resolves.toEqual({
      count: 3,
      oldestCreatedAt
    })
    expect(find).toHaveBeenCalledWith({ status: { $in: ['PENDING', 'PROCESSING'] } })
    expect(sort).toHaveBeenCalledWith({ createdAt: 1 })
    expect(limit).toHaveBeenCalledWith(1)
    expect(project).toHaveBeenCalledWith({ _id: 0, createdAt: 1 })
  })

  test('returns null timestamp when no pending entry exists', async () => {
    const next = vi.fn().mockResolvedValue(null)
    const project = vi.fn().mockReturnValue({ next })
    const limit = vi.fn().mockReturnValue({ project })
    const sort = vi.fn().mockReturnValue({ limit })
    const find = vi.fn().mockReturnValue({ sort })
    mocks.collection.mockReturnValue({
      aggregate: vi.fn().mockReturnValue({ next: vi.fn().mockResolvedValue(null) }),
      find
    })

    await expect(getPendingOutboxMetrics()).resolves.toEqual({
      count: 0,
      oldestCreatedAt: null
    })
  })
})
