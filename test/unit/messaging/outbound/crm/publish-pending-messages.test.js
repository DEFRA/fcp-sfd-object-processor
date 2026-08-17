import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DELIVERY_OUTCOME } from '../../../../../src/constants/outbox.js'

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finalize: vi.fn(),
  logTerminal: vi.fn(),
  updatePublishedAt: vi.fn(),
  publishBatch: vi.fn(),
  startSession: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  runWithCorrelationId: vi.fn((_correlationId, fn) => fn())
}))

vi.mock('../../../../../src/repos/outbox.js', () => ({
  claimProcessableOutboxEntries: mocks.claim,
  finalizeClaimedOutboxEntries: mocks.finalize,
  logTerminalFailuresIfAny: mocks.logTerminal
}))

vi.mock('../../../../../src/repos/metadata.js', () => ({
  bulkUpdatePublishedAtDate: mocks.updatePublishedAt
}))

vi.mock('../../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message-batch.js', () => ({
  publishDocumentUploadMessageBatch: mocks.publishBatch
}))

vi.mock('../../../../../src/messaging/outbound/outbox-worker-id.js', () => ({
  outboxWorkerId: 'worker-observability'
}))

vi.mock('../../../../../src/data/db.js', () => ({
  client: { startSession: mocks.startSession }
}))

vi.mock('../../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn(key => {
      if (key === 'messaging.outboxMaxAttempts') return 2
      if (key === 'mongo.collections.outbox') return 'outbox'
      return null
    })
  }
}))

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: () => ({
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  })
}))

vi.mock('../../../../../src/logging/correlation-id-store.js', () => ({
  runWithCorrelationId: mocks.runWithCorrelationId
}))

const {
  publishPendingMessages,
  buildEntryError
} = await import('../../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js')

const buildEntry = (id, attempts) => ({
  _id: `outbox-${id}`,
  payload: {
    file: { fileId: `file-${id}` },
    messaging: { correlationId: `correlation-${id}` }
  },
  attempts,
  claimedBy: 'worker-observability',
  claimedAt: new Date('2026-08-07T10:00:00.000Z'),
  claimedUntil: new Date('2026-08-07T10:05:00.000Z')
})

describe('publishPendingMessages observability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.startSession.mockReturnValue({
      withTransaction: vi.fn(async callback => callback()),
      endSession: vi.fn()
    })
    mocks.finalize.mockResolvedValue({ acknowledged: true, matchedCount: 1, status: 'SENT' })
    mocks.logTerminal.mockResolvedValue(undefined)
  })

  test('logs every claimed entry using CDP-supported ECS fields', async () => {
    const entry = buildEntry('claimed', 0)
    mocks.claim.mockResolvedValue([entry])
    mocks.publishBatch.mockResolvedValue({ Successful: [], Failed: [] })

    await publishPendingMessages()

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_claimed',
          action: 'claim',
          reference: 'outbox-claimed',
          outcome: 'success',
          created: entry.claimedAt,
          duration: 300000000000
        },
        process: { name: 'worker-observability' }
      },
      'Outbox entry claimed for processing; entryId=file-claimed; attempt=1'
    )
    expect(mocks.runWithCorrelationId).toHaveBeenCalledWith(
      'correlation-claimed',
      expect.any(Function)
    )
  })

  test('logs retryable and terminal failure finalizations separately', async () => {
    const retryable = buildEntry('retryable', 0)
    const terminal = buildEntry('terminal', 1)
    mocks.claim.mockResolvedValue([retryable, terminal])
    mocks.publishBatch.mockResolvedValue({
      Successful: [],
      Failed: [
        { Id: 'file-retryable', Message: 'temporary failure' },
        { Id: 'file-terminal', Code: 'terminal_failure' }
      ]
    })
    mocks.finalize
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, status: 'PENDING' })
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, status: 'PERMANENT_FAILURE' })

    await publishPendingMessages()

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_finalized',
          action: 'finalize_pending',
          reference: 'outbox-retryable',
          outcome: 'failure',
          reason: 'temporary failure'
        },
        process: { name: 'worker-observability' },
        error: {
          type: 'outbox_publish_failure',
          message: 'temporary failure'
        }
      },
      'Outbox entry finalized as PENDING; entryId=file-retryable; attempt=1'
    )
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_finalized',
          action: 'finalize_permanent_failure',
          reference: 'outbox-terminal',
          outcome: 'failure',
          reason: 'terminal_failure'
        },
        process: { name: 'worker-observability' },
        error: {
          type: 'outbox_publish_failure',
          code: 'terminal_failure',
          message: 'terminal_failure'
        }
      },
      'Outbox entry finalized as PERMANENT_FAILURE; entryId=file-terminal; attempt=2'
    )
    expect(mocks.loggerError).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_terminal_failure_imminent',
          action: 'finalize_failed',
          reference: 'outbox-terminal',
          outcome: 'failure',
          reason: 'terminal_failure'
        },
        process: { name: 'worker-observability' },
        error: {
          type: 'outbox_publish_failure',
          code: 'terminal_failure',
          message: 'terminal_failure'
        }
      },
      'Outbox entry will reach PERMANENT_FAILURE after this attempt; entryId=file-terminal; attempt=2'
    )
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.anything(),
      ['outbox-terminal'],
      expect.any(String),
      DELIVERY_OUTCOME.FAILED,
      { type: 'outbox_publish_failure', code: 'terminal_failure', message: 'terminal_failure' }
    )
  })

  test('does not emit terminal audit lookup when failed finalization is rejected', async () => {
    const entry = buildEntry('expired', 1)
    mocks.claim.mockResolvedValue([entry])
    mocks.publishBatch.mockResolvedValue({
      Successful: [],
      Failed: [{ Id: 'file-expired' }]
    })
    mocks.finalize.mockResolvedValue({ acknowledged: true, matchedCount: 0 })

    await publishPendingMessages()

    expect(mocks.logTerminal).not.toHaveBeenCalled()
    expect(mocks.loggerError).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_finalization_rejected',
          action: 'finalize_claim',
          reference: 'outbox-expired',
          outcome: 'failure',
          reason: 'claim_expired_or_ownership_lost'
        },
        process: { name: 'worker-observability' },
        error: {
          type: 'outbox_claim_ownership_error',
          message: 'claim_expired_or_ownership_lost'
        }
      },
      'Outbox entry could not be finalized by this worker; entryId=file-expired'
    )
  })

  test('returns early and logs when there are no pending messages', async () => {
    mocks.claim.mockResolvedValue([])

    await publishPendingMessages()

    expect(mocks.loggerInfo).toHaveBeenCalledWith('No pending outbox messages to process.')
    expect(mocks.publishBatch).not.toHaveBeenCalled()
  })

  test('finalizes successful entries and calls bulkUpdatePublishedAtDate', async () => {
    const entry = buildEntry('success', 0)
    mocks.claim.mockResolvedValue([entry])
    mocks.publishBatch.mockResolvedValue({
      Successful: [{ Id: 'file-success' }],
      Failed: []
    })

    await publishPendingMessages()

    expect(mocks.updatePublishedAt).toHaveBeenCalledWith(expect.anything(), ['file-success'])
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'outbox_finalized',
          action: 'finalize_sent',
          outcome: 'success'
        })
      }),
      'Outbox entry finalized as SENT; entryId=file-success; attempt=1'
    )
  })

  test('does not call bulkUpdatePublishedAtDate when no successful entries', async () => {
    const entry = buildEntry('fail-only', 0)
    mocks.claim.mockResolvedValue([entry])
    mocks.publishBatch.mockResolvedValue({
      Successful: [],
      Failed: [{ Id: 'file-fail-only', Message: 'some error' }]
    })

    await publishPendingMessages()

    expect(mocks.updatePublishedAt).not.toHaveBeenCalled()
  })

  test('warns when a publish result Id does not match any claimed entry', async () => {
    const entry = buildEntry('known', 0)
    mocks.claim.mockResolvedValue([entry])
    mocks.publishBatch.mockResolvedValue({
      Successful: [{ Id: 'file-unknown' }],
      Failed: []
    })

    await publishPendingMessages()

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'outbox_publish_result_unmatched',
          outcome: 'failure'
        }),
        error: expect.objectContaining({
          type: 'outbox_publish_result_unmatched'
        })
      }),
      'SNS publish result did not match a claimed outbox entry; entryId=file-unknown'
    )
  })

  test('uses entry.messageId when payload.file.fileId is absent', async () => {
    const entry = {
      _id: 'outbox-msg',
      messageId: 'msg-id-123',
      attempts: 0,
      claimedBy: 'worker-observability',
      claimedAt: new Date('2026-08-07T10:00:00.000Z'),
      claimedUntil: new Date('2026-08-07T10:05:00.000Z')
    }
    mocks.claim.mockResolvedValue([entry])
    mocks.publishBatch.mockResolvedValue({
      Successful: [{ Id: 'msg-id-123' }],
      Failed: []
    })

    await publishPendingMessages()

    expect(mocks.updatePublishedAt).toHaveBeenCalledWith(expect.anything(), ['msg-id-123'])
  })

  test('clamps negative claim duration to zero nanoseconds', async () => {
    const entry = {
      ...buildEntry('neg-dur', 0),
      claimedAt: new Date('2026-08-07T10:05:00.000Z'),
      claimedUntil: new Date('2026-08-07T10:00:00.000Z')
    }
    mocks.claim.mockResolvedValue([entry])
    mocks.publishBatch.mockResolvedValue({ Successful: [], Failed: [] })

    await publishPendingMessages()

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ duration: 0 })
      }),
      'Outbox entry claimed for processing; entryId=file-neg-dur; attempt=1'
    )
  })

  test('uses a separate correlation context for each entry in the same batch', async () => {
    const first = buildEntry('first', 0)
    const second = buildEntry('second', 0)
    mocks.claim.mockResolvedValue([first, second])
    mocks.publishBatch.mockResolvedValue({ Successful: [], Failed: [] })

    await publishPendingMessages()

    expect(mocks.runWithCorrelationId).toHaveBeenCalledWith('correlation-first', expect.any(Function))
    expect(mocks.runWithCorrelationId).toHaveBeenCalledWith('correlation-second', expect.any(Function))
  })

  test('uses failed_to_publish fallback when failure entry has no Message or Code', async () => {
    const entry = buildEntry('no-detail', 1)
    mocks.claim.mockResolvedValue([entry])
    mocks.publishBatch.mockResolvedValue({
      Successful: [],
      Failed: [{ Id: 'file-no-detail' }]
    })
    mocks.finalize.mockResolvedValue({ acknowledged: true, matchedCount: 1, status: 'PERMANENT_FAILURE' })

    await publishPendingMessages()

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ reason: 'failed_to_publish' }),
        error: expect.objectContaining({ message: 'failed_to_publish' })
      }),
      expect.stringContaining('PERMANENT_FAILURE')
    )
  })

  test('calls logTerminalFailuresIfAny with correct args for terminal failures', async () => {
    const terminal = buildEntry('terminal-audit', 1)
    mocks.claim.mockResolvedValue([terminal])
    mocks.publishBatch.mockResolvedValue({
      Successful: [],
      Failed: [{ Id: 'file-terminal-audit', Message: 'permanent error' }]
    })
    mocks.finalize.mockResolvedValue({ acknowledged: true, matchedCount: 1, status: 'PERMANENT_FAILURE' })

    await publishPendingMessages()

    expect(mocks.logTerminal).toHaveBeenCalledWith(
      'outbox',
      ['file-terminal-audit'],
      2,
      null,
      'Failed to send message',
      'worker-observability'
    )
  })

  test('logs error and rethrows when an unexpected error occurs', async () => {
    const boom = new Error('db exploded')
    mocks.claim.mockRejectedValue(boom)

    await expect(publishPendingMessages()).rejects.toThrow('db exploded')
    expect(mocks.loggerError).toHaveBeenCalledWith(boom, 'Error publishing pending outbox messages')
  })

  test('logs processing summary after each batch', async () => {
    const entry = buildEntry('summary', 0)
    mocks.claim.mockResolvedValue([entry])
    mocks.publishBatch.mockResolvedValue({
      Successful: [{ Id: 'file-summary' }],
      Failed: []
    })

    await publishPendingMessages()

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'Outbox processing complete. Total: 1 sent, 0 failed, 0 rejected'
    )
  })
})

describe('buildEntryError', () => {
  test('returns message and code when both are present', () => {
    const entry = { payload: { file: { fileId: 'file-1' } } }
    const result = buildEntryError(entry, [{ Id: 'file-1', Code: 'KMSAccessDenied', Message: 'KMS key denied' }])
    expect(result).toEqual({ type: 'outbox_publish_failure', code: 'KMSAccessDenied', message: 'KMS key denied' })
  })

  test('returns code as message when only Code is present', () => {
    const entry = { payload: { file: { fileId: 'file-1' } } }
    const result = buildEntryError(entry, [{ Id: 'file-1', Code: 'ThrottlingException' }])
    expect(result).toEqual({ type: 'outbox_publish_failure', code: 'ThrottlingException', message: 'ThrottlingException' })
  })

  test('returns message without code when only Message is present', () => {
    const entry = { payload: { file: { fileId: 'file-1' } } }
    const result = buildEntryError(entry, [{ Id: 'file-1', Message: 'sns error' }])
    expect(result).toEqual({ type: 'outbox_publish_failure', message: 'sns error' })
  })

  test('returns default message when failure has neither Message nor Code', () => {
    const entry = { payload: { file: { fileId: 'file-1' } } }
    const result = buildEntryError(entry, [{ Id: 'file-1' }])
    expect(result).toEqual({ type: 'outbox_publish_failure', message: 'failed_to_publish' })
  })

  test('returns default message when no matching failure is found', () => {
    const entry = { payload: { file: { fileId: 'file-1' } } }
    const result = buildEntryError(entry, [{ Id: 'file-other', Message: 'unrelated' }])
    expect(result).toEqual({ type: 'outbox_publish_failure', message: 'failed_to_publish' })
  })
})
