import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finalize: vi.fn(),
  logTerminal: vi.fn(),
  updatePublishedAt: vi.fn(),
  publishBatch: vi.fn(),
  startSession: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
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

const { publishPendingMessages } = await import('../../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js')

const buildEntry = (id, attempts) => ({
  _id: `outbox-${id}`,
  payload: { file: { fileId: `file-${id}` } },
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
    mocks.finalize.mockResolvedValue({ acknowledged: true, matchedCount: 1 })
    mocks.logTerminal.mockResolvedValue(undefined)
  })

  test('logs claim ownership fields for every claimed entry', async () => {
    const entry = buildEntry('claimed', 0)
    mocks.claim.mockResolvedValue([entry])
    mocks.publishBatch.mockResolvedValue({ Successful: [], Failed: [] })

    await publishPendingMessages()

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'outbox_claimed',
          reference: 'outbox-claimed',
          entryId: 'file-claimed',
          claimedBy: 'worker-observability',
          claimedAt: entry.claimedAt,
          claimedUntil: entry.claimedUntil
        })
      }),
      'Outbox entry claimed for processing'
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

    await publishPendingMessages()

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ event: expect.objectContaining({ type: 'outbox_finalized', status: 'PENDING' }) }),
      'Outbox entry finalized as PENDING'
    )
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ event: expect.objectContaining({ type: 'outbox_finalized', status: 'FAILED' }) }),
      'Outbox entry finalized as FAILED'
    )
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'outbox_terminal_failure_imminent',
          entryId: 'file-terminal',
          attempts: 2,
          reason: 'terminal_failure'
        })
      }),
      'Outbox entry will reach FAILED after this attempt'
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
      expect.objectContaining({ event: expect.objectContaining({ type: 'outbox_finalization_rejected' }) }),
      'Outbox entry could not be finalized by this worker'
    )
  })
})
