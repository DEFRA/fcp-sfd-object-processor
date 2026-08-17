import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../src/config/index.js', () => {
  const get = vi.fn((key) => {
    switch (key) {
      case 'mongo.collections.outbox': return 'outbox'
      case 'mongo.outboxQueryLimit': return 10
      case 'messaging.outboxMaxAttempts': return 2
      default: return null
    }
  })
  return { config: { get } }
})
vi.mock('../../../src/data/db.js', () => ({
  db: { collection: vi.fn() }
}))

const { mockLoggerError, mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn()
}))
vi.mock('../../../src/logging/logger.js', () => ({
  createLogger: () => ({ error: mockLoggerError, info: vi.fn(), warn: mockLoggerWarn })
}))

const { mockSendAuditEvent } = vi.hoisted(() => ({
  mockSendAuditEvent: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: mockSendAuditEvent
}))

const { config } = await import('../../../src/config/index.js')
const { db } = await import('../../../src/data/db.js')
const {
  createOutboxEntries,
  logTerminalFailuresIfAny
} = await import('../../../src/repos/outbox.js')

describe('src/repos/outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('createOutboxEntries inserts only complete files and returns insertedIds', async () => {
    const ids = { 0: 'm1', 1: 'm2' }
    const documents = [
      { file: { fileStatus: 'complete' } },
      { file: { fileStatus: 'pending' } }
    ]

    const insertResult = { acknowledged: true, insertedIds: { 0: 'abc' } }
    const collectionObj = { insertMany: vi.fn().mockResolvedValue(insertResult) }
    db.collection.mockReturnValue(collectionObj)

    const res = await createOutboxEntries(ids, documents, { session: 's' })
    expect(collectionObj.insertMany).toHaveBeenCalled()
    expect(res).toEqual(insertResult.insertedIds)
    expect(config.get).toHaveBeenCalledWith('mongo.collections.outbox')
  })

  test('createOutboxEntries returns empty object when no complete files', async () => {
    const ids = { 0: 'm1' }
    const documents = [{ file: { fileStatus: 'pending' } }]
    // ensure insertMany not called
    const collectionObj = { insertMany: vi.fn() }
    db.collection.mockReturnValue(collectionObj)

    const res = await createOutboxEntries(ids, documents, null)
    expect(res).toEqual({})
    expect(collectionObj.insertMany).not.toHaveBeenCalled()
  })

  test('createOutboxEntries throws when insertMany not acknowledged', async () => {
    const ids = { 0: 'm1' }
    const documents = [{ file: { fileStatus: 'complete' } }]
    const collectionObj = { insertMany: vi.fn().mockResolvedValue({ acknowledged: false }) }
    db.collection.mockReturnValue(collectionObj)

    await expect(createOutboxEntries(ids, documents, {})).rejects.toThrow('Failed to insert outbox entries')
  })
})

describe('logTerminalFailuresIfAny', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendAuditEvent.mockResolvedValue(undefined)
  })

  const buildTerminalDoc = (fileId = 'file-id-1', attempts = 2, id = 'outbox-doc-id', correlationId) => ({
    _id: { toString: () => id },
    payload: { file: { fileId }, ...(correlationId !== undefined && { messaging: { correlationId } }) },
    attempts
  })

  const buildCollectionMock = (terminalDocs, potentialCount) => {
    const toArray = vi.fn().mockResolvedValue(terminalDocs)
    const find = vi.fn().mockReturnValue({ toArray })
    const countDocuments = vi.fn().mockResolvedValue(potentialCount ?? terminalDocs.length)
    return { countDocuments, find }
  }

  test('emits document/failed audit event for each terminal doc', async () => {
    const terminalDoc = buildTerminalDoc('file-id-1', 2)
    db.collection.mockReturnValue(buildCollectionMock([terminalDoc]))

    await logTerminalFailuresIfAny('outbox', ['file-id-1'], 2, null, 'SNS failure')

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'failed', entityid: 'file-id-1' }],
          status: 'failure',
          details: expect.objectContaining({ reason: 'SNS failure', attempts: 2 })
        })
      })
    )
  })

  test('emits one event per terminal doc', async () => {
    const terminalDocs = [buildTerminalDoc('file-1'), buildTerminalDoc('file-2')]
    db.collection.mockReturnValue(buildCollectionMock(terminalDocs))

    await logTerminalFailuresIfAny('outbox', ['file-1', 'file-2'], 2, null, 'error')

    expect(mockSendAuditEvent).toHaveBeenCalledTimes(2)
  })

  test('uses doc._id as entityid fallback when payload.file.fileId is absent', async () => {
    const doc = { _id: { toString: () => 'fallback-id' }, payload: {}, attempts: 2 }
    db.collection.mockReturnValue(buildCollectionMock([doc]))

    await logTerminalFailuresIfAny('outbox', ['file-id-1'], 2, null, 'error')

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'failed', entityid: 'fallback-id' }]
        })
      })
    )
  })

  test('passes correlationid from payload.messaging.correlationId to audit event', async () => {
    const doc = buildTerminalDoc('file-id-1', 2, 'outbox-doc-id', 'corr-123')
    db.collection.mockReturnValue(buildCollectionMock([doc]))

    await logTerminalFailuresIfAny('outbox', ['file-id-1'], 2, null, 'error')

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ correlationid: 'corr-123' })
    )
  })

  test('passes correlationid as undefined when messaging is absent', async () => {
    const doc = buildTerminalDoc('file-id-1', 2, 'outbox-doc-id')
    db.collection.mockReturnValue(buildCollectionMock([doc]))

    await logTerminalFailuresIfAny('outbox', ['file-id-1'], 2, null, 'error')

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ correlationid: undefined })
    )
  })

  test('uses empty string as entityid when both payload.file.fileId and _id are absent', async () => {
    const doc = { _id: null, payload: {}, attempts: 2 }
    db.collection.mockReturnValue(buildCollectionMock([doc]))

    await logTerminalFailuresIfAny('outbox', ['file-id-1'], 2, null, 'error')

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          entities: [{ entity: 'document', action: 'failed', entityid: '' }]
        })
      })
    )
  })

  test('logs terminal failure with default reason when errMsg is omitted', async () => {
    const doc = { _id: { toString: () => 'id' }, payload: {}, attempts: 2 }
    db.collection.mockReturnValue(buildCollectionMock([doc]))

    await logTerminalFailuresIfAny('outbox', ['file-id-1'], 2, null, undefined, 'worker-1')

    expect(mockLoggerError).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_terminal_failure',
          action: 'terminal_failure',
          reference: 'id',
          outcome: 'failure',
          reason: 'terminal_failure'
        },
        process: { name: 'worker-1' },
        error: {
          type: 'outbox_terminal_failure',
          message: 'terminal_failure'
        }
      },
      'Outbox entry reached PERMANENT_FAILURE after max attempts; entryId=null; attempt=2'
    )
  })

  test('logs structured error for each terminal doc', async () => {
    const terminalDoc = buildTerminalDoc('f1', 2)
    db.collection.mockReturnValue(buildCollectionMock([terminalDoc]))

    await logTerminalFailuresIfAny('outbox', ['f1'], 2, null, 'publish error', 'worker-1')

    expect(mockLoggerError).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_terminal_failure',
          action: 'terminal_failure',
          reference: 'outbox-doc-id',
          outcome: 'failure',
          reason: 'publish error'
        },
        process: { name: 'worker-1' },
        error: {
          type: 'outbox_terminal_failure',
          id: 'f1',
          message: 'publish error'
        }
      },
      'Outbox entry reached PERMANENT_FAILURE after max attempts; entryId=f1; attempt=2'
    )
  })

  test('uses doc.error.message as reason and includes error.code when doc.error is set', async () => {
    const doc = {
      _id: { toString: () => 'outbox-kms' },
      payload: { file: { fileId: 'file-kms' } },
      attempts: 2,
      error: { code: 'KMSAccessDenied', message: 'KMS key denied' }
    }
    db.collection.mockReturnValue(buildCollectionMock([doc]))

    await logTerminalFailuresIfAny('outbox', ['file-kms'], 2, null, 'Failed to send message', 'worker-1')

    expect(mockLoggerError).toHaveBeenCalledWith(
      {
        event: {
          type: 'outbox_terminal_failure',
          action: 'terminal_failure',
          reference: 'outbox-kms',
          outcome: 'failure',
          reason: 'KMS key denied'
        },
        process: { name: 'worker-1' },
        error: {
          type: 'outbox_terminal_failure',
          id: 'file-kms',
          code: 'KMSAccessDenied',
          message: 'KMS key denied'
        }
      },
      'Outbox entry reached PERMANENT_FAILURE after max attempts; entryId=file-kms; attempt=2'
    )
    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          details: { reason: 'KMS key denied', code: 'KMSAccessDenied', attempts: 2 }
        })
      })
    )
  })

  test('audit event details omit code when doc.error has no code', async () => {
    const doc = {
      _id: { toString: () => 'outbox-plain' },
      payload: { file: { fileId: 'file-plain' } },
      attempts: 2,
      error: { message: 'throttled' }
    }
    db.collection.mockReturnValue(buildCollectionMock([doc]))

    await logTerminalFailuresIfAny('outbox', ['file-plain'], 2, null, 'Failed to send message', 'worker-1')

    expect(mockSendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          details: { reason: 'throttled', attempts: 2 }
        })
      })
    )
  })

  test('skips terminal query when no potential terminal entries', async () => {
    const find = vi.fn()
    db.collection.mockReturnValue({ countDocuments: vi.fn().mockResolvedValue(0), find })

    await logTerminalFailuresIfAny('outbox', ['f1'], 2, null)

    expect(find).not.toHaveBeenCalled()
    expect(mockSendAuditEvent).not.toHaveBeenCalled()
  })

  test('resolves without throwing when sendAuditEvent rejects for one or more terminal docs', async () => {
    const terminalDocs = [buildTerminalDoc('file-1'), buildTerminalDoc('file-2')]
    db.collection.mockReturnValue(buildCollectionMock(terminalDocs))
    mockSendAuditEvent
      .mockRejectedValueOnce(new Error('broker down'))
      .mockResolvedValueOnce(undefined)

    await expect(
      logTerminalFailuresIfAny('outbox', ['file-1', 'file-2'], 2, null, 'error')
    ).resolves.not.toThrow()

    expect(mockSendAuditEvent).toHaveBeenCalledTimes(2)
  })
})
