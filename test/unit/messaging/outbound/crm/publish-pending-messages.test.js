import { beforeEach, describe, expect, test, vi } from 'vitest'
import { FAILED } from '../../../../../src/constants/outbox.js'

const mockInfo = vi.fn()
const mockError = vi.fn()
vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: () => ({ info: mockInfo, error: mockError })
}))

const { mockConfigGet } = vi.hoisted(() => ({
  mockConfigGet: vi.fn((key) => {
    if (key === 'messaging.outboxMaxAttempts') return 2
    if (key === 'mongo.collections.outbox') return 'outbox'
    return null
  })
}))

vi.mock('../../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

const { mockLogTerminalFailuresIfAny } = vi.hoisted(() => ({
  mockLogTerminalFailuresIfAny: vi.fn().mockResolvedValue(undefined)
}))

const mockGetProcessable = vi.fn()
vi.mock('../../../../../src/repos/outbox.js', () => ({
  getProcessableOutboxEntries: () => mockGetProcessable(),
  bulkUpdateDeliveryStatus: vi.fn(),
  logTerminalFailuresIfAny: mockLogTerminalFailuresIfAny
}))

const mockBulkUpdatePublishedAtDate = vi.fn()
vi.mock('../../../../../src/repos/metadata.js', () => ({
  bulkUpdatePublishedAtDate: (...args) => mockBulkUpdatePublishedAtDate(...args)
}))

const mockPublishBatch = vi.fn()
vi.mock('../../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message-batch.js', () => ({
  publishDocumentUploadMessageBatch: (...args) => mockPublishBatch(...args)
}))

const mockStartSession = vi.fn()
vi.mock('../../../../../src/data/db.js', () => ({
  client: { startSession: () => mockStartSession() }
}))

let publishPendingMessages
let bulkUpdateDeliveryStatus

describe('publishPendingMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogTerminalFailuresIfAny.mockResolvedValue(undefined)
    mockConfigGet.mockImplementation((key) => {
      if (key === 'messaging.outboxMaxAttempts') return 2
      if (key === 'mongo.collections.outbox') return 'outbox'
      return null
    })
    // default session mock
    const session = {
      withTransaction: vi.fn(async (cb) => cb()),
      endSession: vi.fn()
    }
    mockStartSession.mockReturnValue(session)
    // dynamically import the module under test after mocks are set up
    return (async () => {
      const mod = await import('../../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js')
      publishPendingMessages = mod.publishPendingMessages
      const outbox = await import('../../../../../src/repos/outbox.js')
      bulkUpdateDeliveryStatus = outbox.bulkUpdateDeliveryStatus
    })()
  })

  test('returns early when no pending messages', async () => {
    mockGetProcessable.mockResolvedValue([])
    await publishPendingMessages()
    expect(mockInfo).toHaveBeenCalled()
    // ensure no publish calls
    expect(mockPublishBatch).not.toHaveBeenCalled()
  })

  test('processes successful messages and updates status and publishedAt', async () => {
    const entry = { messageId: 'm1', _id: 'id1' }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [{ Id: 'm1' }], Failed: [] })

    await publishPendingMessages()

    expect(mockPublishBatch).toHaveBeenCalled()
    expect(bulkUpdateDeliveryStatus).toHaveBeenCalled()
    expect(mockBulkUpdatePublishedAtDate).toHaveBeenCalled()
    expect(mockInfo).toHaveBeenCalled()
  })

  test('logs imminent terminal failures when attempts reach maxAttempts', async () => {
    const entry = { messageId: 'm2', _id: 'id2', attempts: 1 }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{ Id: 'm2', Message: 'boom' }] })

    await publishPendingMessages()

    // bulk update should have been called for failed
    expect(bulkUpdateDeliveryStatus).toHaveBeenCalled()
    // logger.error should be called for imminent terminal
    const calledWith = mockError.mock.calls.find(call => JSON.stringify(call[0]).includes('outbox_terminal_failure_imminent'))
    expect(calledWith).toBeDefined()
  })

  test('rethrows when publishDocumentUploadMessageBatch throws', async () => {
    mockGetProcessable.mockResolvedValue([{ messageId: 'm3' }])
    mockPublishBatch.mockRejectedValue(new Error('publish failed'))

    await expect(publishPendingMessages()).rejects.toThrow('publish failed')
    // ensure session end is still called
    const session = mockStartSession()
    expect(session.endSession).toHaveBeenCalled()
  })

  test('uses payload.file.fileId when logging imminent terminal failures', async () => {
    const entry = {
      _id: 'id-file',
      payload: { file: { fileId: 'file-1' } },
      attempts: 1
    }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{ Id: 'file-1', Code: 'sns_error' }] })

    await publishPendingMessages()

    const imminentLog = mockError.mock.calls.find(call =>
      call[0]?.event?.type === 'outbox_terminal_failure_imminent'
    )
    expect(imminentLog).toBeDefined()
    expect(imminentLog[0].event.entryId).toBe('file-1')
    expect(imminentLog[0].event.reason).toBe('sns_error')
  })

  test('does not log imminent terminal failure when attempts remain below max', async () => {
    const entry = { messageId: 'm4', _id: 'id4', attempts: 0 }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{ Id: 'm4' }] })

    await publishPendingMessages()

    const imminentLog = mockError.mock.calls.find(call =>
      call[0]?.event?.type === 'outbox_terminal_failure_imminent'
    )
    expect(imminentLog).toBeUndefined()
  })

  test('uses failure message when logging imminent terminal failures', async () => {
    const entry = { messageId: 'm-msg', _id: 'id-msg', attempts: 1 }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{ Id: 'm-msg', Message: 'sns down' }] })

    await publishPendingMessages()

    const imminentLog = mockError.mock.calls.find(call =>
      call[0]?.event?.type === 'outbox_terminal_failure_imminent'
    )
    expect(imminentLog[0].event.reason).toBe('sns down')
    expect(imminentLog[0].event.attempts).toBe(2)
  })

  test('defaults imminent terminal reason when failure has no message or code', async () => {
    const entry = { messageId: 'm5', _id: 'id5', attempts: 1 }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{ Id: 'm5' }] })

    await publishPendingMessages()

    const imminentLog = mockError.mock.calls.find(call =>
      call[0]?.event?.type === 'outbox_terminal_failure_imminent'
    )
    expect(imminentLog[0].event.reason).toBe('failed_to_publish')
  })

  test('processes failed batch without successful updates', async () => {
    const entry = { messageId: 'm6', _id: 'id6', attempts: 0 }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{ Id: 'm6', Message: 'failed' }] })

    await publishPendingMessages()

    expect(bulkUpdateDeliveryStatus).toHaveBeenCalledWith(
      expect.anything(),
      ['m6'],
      FAILED,
      'Failed to send message'
    )
    expect(mockBulkUpdatePublishedAtDate).not.toHaveBeenCalled()
  })

  test('falls back to default failure reason when failed metadata cannot be matched', async () => {
    mockConfigGet.mockImplementation((key) => {
      if (key === 'messaging.outboxMaxAttempts') return 1
      return null
    })
    const entry = { attempts: 0 }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{}] })

    await publishPendingMessages()

    const imminentLog = mockError.mock.calls.find(call =>
      call[0]?.event?.type === 'outbox_terminal_failure_imminent'
    )
    expect(imminentLog[0].event.entryId).toBeNull()
    expect(imminentLog[0].event.reason).toBe('failed_to_publish')
  })

  test('resolves imminent terminal entry id from payload file id when present', async () => {
    mockConfigGet.mockImplementation((key) => {
      if (key === 'messaging.outboxMaxAttempts') return 1
      return null
    })
    const entry = {
      payload: { file: { fileId: 'file-only' } },
      messageId: 'message-only',
      attempts: 0
    }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{ Id: 'file-only' }] })

    await publishPendingMessages()

    const imminentLog = mockError.mock.calls.find(call =>
      call[0]?.event?.type === 'outbox_terminal_failure_imminent'
    )
    expect(imminentLog[0].event.entryId).toBe('file-only')
  })

  test('resolves imminent terminal entry id from messageId when file id is absent', async () => {
    mockConfigGet.mockImplementation((key) => {
      if (key === 'messaging.outboxMaxAttempts') return 1
      return null
    })
    const entry = {
      payload: { file: {} },
      messageId: 'message-only',
      attempts: undefined
    }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{ Id: 'message-only' }] })

    await publishPendingMessages()

    const imminentLog = mockError.mock.calls.find(call =>
      call[0]?.event?.type === 'outbox_terminal_failure_imminent'
    )
    expect(imminentLog[0].event.entryId).toBe('message-only')
    expect(imminentLog[0].event.attempts).toBe(1)
    expect(imminentLog[0].event.reference).toBeUndefined()
  })

  test('processes messages in batches of ten', async () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({ messageId: `m${i}`, _id: `id${i}` }))
    mockGetProcessable.mockResolvedValue(entries)
    mockPublishBatch.mockResolvedValue({ Successful: [{ Id: 'm0' }], Failed: [] })

    await publishPendingMessages()

    expect(mockPublishBatch).toHaveBeenCalledTimes(2)
    expect(mockPublishBatch.mock.calls[0][0]).toHaveLength(10)
    expect(mockPublishBatch.mock.calls[1][0]).toHaveLength(1)
  })

  test('calls logTerminalFailuresIfAny after withTransaction resolves when there are failures', async () => {
    const entry = { messageId: 'm7', _id: 'id7', attempts: 1 }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{ Id: 'm7' }] })

    await publishPendingMessages()

    expect(mockLogTerminalFailuresIfAny).toHaveBeenCalledWith(
      'outbox',
      ['m7'],
      2,
      null,
      'Failed to send message'
    )
  })

  test('does not call logTerminalFailuresIfAny when Failed is empty', async () => {
    const entry = { messageId: 'm8', _id: 'id8' }
    mockGetProcessable.mockResolvedValue([entry])
    mockPublishBatch.mockResolvedValue({ Successful: [{ Id: 'm8' }], Failed: [] })

    await publishPendingMessages()

    expect(mockLogTerminalFailuresIfAny).not.toHaveBeenCalled()
  })
})
