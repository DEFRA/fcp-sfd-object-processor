import { beforeEach, describe, expect, test, vi } from 'vitest'

import { DELIVERY_OUTCOME } from '../../../../src/constants/outbox.js'

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
  configGet: vi.fn((key) => {
    if (key === 'messaging.outboxMaxAttempts') return 2
    if (key === 'mongo.collections.outbox') return 'outbox'
    return null
  })
}))

vi.mock('../../../../src/repos/outbox.js', () => ({
  claimProcessableOutboxEntries: mocks.claim,
  finalizeClaimedOutboxEntries: mocks.finalize,
  logTerminalFailuresIfAny: mocks.logTerminal
}))

vi.mock('../../../../src/repos/metadata.js', () => ({
  bulkUpdatePublishedAtDate: mocks.updatePublishedAt
}))

vi.mock('../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message-batch.js', () => ({
  publishDocumentUploadMessageBatch: mocks.publishBatch
}))

vi.mock('../../../../src/messaging/outbound/outbox-worker-id.js', () => ({
  outboxWorkerId: 'worker-1'
}))

vi.mock('../../../../src/data/db.js', () => ({
  client: { startSession: mocks.startSession }
}))

vi.mock('../../../../src/config/index.js', () => ({
  config: { get: mocks.configGet }
}))

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: () => ({
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  })
}))

const { publishPendingMessages } = await import('../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js')

const buildEntry = (id, attempts = 0) => ({
  _id: `outbox-${id}`,
  messageId: `metadata-${id}`,
  payload: { file: { fileId: `file-${id}` }, messaging: { correlationId: `correlation-${id}` } },
  status: 'PROCESSING',
  attempts,
  claimedBy: 'worker-1',
  claimedAt: new Date('2026-08-07T10:00:00.000Z'),
  claimedUntil: new Date('2026-08-07T10:05:00.000Z')
})

describe('publishPendingMessages', () => {
  let session

  beforeEach(() => {
    vi.clearAllMocks()
    session = {
      withTransaction: vi.fn(async callback => callback()),
      endSession: vi.fn()
    }
    mocks.startSession.mockReturnValue(session)
    mocks.finalize.mockResolvedValue({ acknowledged: true, matchedCount: 1, status: 'SENT' })
    mocks.logTerminal.mockResolvedValue(undefined)
    mocks.updatePublishedAt.mockResolvedValue({ acknowledged: true })
    mocks.publishBatch.mockResolvedValue({ Successful: [], Failed: [] })
  })

  test('claims with the process worker ID and finalizes SNS results by outbox ID', async () => {
    const successfulEntry = buildEntry('success')
    const failedEntry = buildEntry('failure')
    mocks.claim.mockResolvedValue([successfulEntry, failedEntry])
    mocks.publishBatch.mockResolvedValue({
      Successful: [{ Id: 'file-success' }],
      Failed: [{ Id: 'file-failure', Message: 'SNS unavailable' }]
    })
    mocks.finalize
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, status: 'SENT' })
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, status: 'PERMANENT_FAILURE' })

    await publishPendingMessages()

    expect(mocks.claim).toHaveBeenCalledWith('worker-1')
    expect(mocks.finalize).toHaveBeenNthCalledWith(
      1,
      session,
      ['outbox-success'],
      'worker-1',
      DELIVERY_OUTCOME.SUCCEEDED,
      null
    )
    expect(mocks.finalize).toHaveBeenNthCalledWith(
      2,
      session,
      ['outbox-failure'],
      'worker-1',
      DELIVERY_OUTCOME.FAILED,
      { type: 'outbox_publish_failure', message: 'SNS unavailable' }
    )
    expect(mocks.updatePublishedAt).toHaveBeenCalledWith(session, ['file-success'])
    expect(mocks.logTerminal).toHaveBeenCalledWith(
      'outbox',
      ['file-failure'],
      2,
      null,
      'Failed to send message',
      'worker-1'
    )
    expect(session.withTransaction).toHaveBeenCalledOnce()
    expect(session.endSession).toHaveBeenCalledOnce()
  })

  test('does not publish when no entries can be claimed', async () => {
    mocks.claim.mockResolvedValue([])

    await publishPendingMessages()

    expect(mocks.publishBatch).not.toHaveBeenCalled()
    expect(mocks.finalize).not.toHaveBeenCalled()
    expect(session.endSession).toHaveBeenCalledOnce()
  })

  test('preserves SNS batches of ten', async () => {
    const entries = Array.from({ length: 21 }, (_, index) => buildEntry(index))
    mocks.claim.mockResolvedValue(entries)

    await publishPendingMessages()

    expect(mocks.publishBatch).toHaveBeenCalledTimes(3)
    expect(mocks.publishBatch).toHaveBeenNthCalledWith(1, entries.slice(0, 10))
    expect(mocks.publishBatch).toHaveBeenNthCalledWith(2, entries.slice(10, 20))
    expect(mocks.publishBatch).toHaveBeenNthCalledWith(3, entries.slice(20))
  })

  test('updates metadata only for successful entries whose claims are finalized', async () => {
    const accepted = buildEntry('accepted')
    const rejected = buildEntry('rejected')
    mocks.claim.mockResolvedValue([accepted, rejected])
    mocks.publishBatch.mockResolvedValue({
      Successful: [{ Id: 'file-accepted' }, { Id: 'file-rejected' }],
      Failed: []
    })
    mocks.finalize
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, status: 'SENT' })
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 0, status: undefined })

    await publishPendingMessages()

    expect(mocks.updatePublishedAt).toHaveBeenCalledWith(session, ['file-accepted'])
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_finalization_rejected',
          action: 'finalize_claim',
          reference: 'outbox-rejected',
          outcome: 'failure',
          reason: 'claim_expired_or_ownership_lost'
        },
        process: { name: 'worker-1' },
        error: {
          type: 'outbox_claim_ownership_error',
          message: 'claim_expired_or_ownership_lost'
        }
      },
      'Outbox entry could not be finalized by this worker; entryId=file-rejected'
    )
  })

  test('leaves unmatched SNS results claimed for lease recovery and logs them', async () => {
    mocks.claim.mockResolvedValue([buildEntry('known')])
    mocks.publishBatch.mockResolvedValue({
      Successful: [{ Id: 'file-unknown' }],
      Failed: []
    })

    await publishPendingMessages()

    expect(mocks.finalize).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_publish_result_unmatched',
          action: 'match_publish_result',
          outcome: 'failure',
          reason: 'publish_result_did_not_match_claimed_entry'
        },
        error: {
          type: 'outbox_publish_result_unmatched',
          message: 'publish_result_did_not_match_claimed_entry'
        }
      },
      'SNS publish result did not match a claimed outbox entry; entryId=file-unknown'
    )
  })

  test('ends the session and rethrows claim errors', async () => {
    mocks.claim.mockRejectedValue(new Error('Mongo unavailable'))

    await expect(publishPendingMessages()).rejects.toThrow('Mongo unavailable')

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.any(Error),
      'Error publishing pending outbox messages'
    )
    expect(session.endSession).toHaveBeenCalledOnce()
  })
})
