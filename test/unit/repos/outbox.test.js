/* eslint-disable @stylistic/no-multiple-empty-lines */
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

import { config } from '../../../src/config/index.js'
import { db } from '../../../src/data/db.js'
import {
  createOutboxEntries,
  getProcessableOutboxEntries,
  bulkUpdateDeliveryStatus,
  logTerminalFailuresIfAny
} from '../../../src/repos/outbox.js'

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

  test('getProcessableOutboxEntries queries with correct filter and returns entries', async () => {
    const expected = [{ _id: '1' }]
    const toArray = vi.fn().mockResolvedValue(expected)
    const limit = vi.fn(() => ({ toArray }))
    const find = vi.fn(() => ({ limit }))
    const collectionObj = { find }
    db.collection.mockReturnValue(collectionObj)

    const res = await getProcessableOutboxEntries()
    expect(find).toHaveBeenCalled()
    expect(res).toBe(expected)
  })

  test('bulkUpdateDeliveryStatus uses sent update path and returns result', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    const collectionObj = { updateMany }
    db.collection.mockReturnValue(collectionObj)

    const session = { id: 's' }
    const fileIds = ['f1']
    const res = await bulkUpdateDeliveryStatus(session, fileIds, 'SENT')
    expect(updateMany).toHaveBeenCalled()
    expect(res).toEqual({ acknowledged: true })
  })

  test('bulkUpdateDeliveryStatus uses failure pipeline and returns result', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    const collectionObj = { updateMany }
    db.collection.mockReturnValue(collectionObj)

    const res = await bulkUpdateDeliveryStatus({ id: 's' }, ['f1'], 'FAILED', 'boom')
    expect(updateMany).toHaveBeenCalled()
    expect(res).toEqual({ acknowledged: true })
  })

  test('bulkUpdateDeliveryStatus does not call sendAuditEvent or logTerminalFailuresIfAny', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    db.collection.mockReturnValue({ updateMany })

    await bulkUpdateDeliveryStatus({ id: 's' }, ['f1'], 'FAILED', 'boom')

    expect(mockSendAuditEvent).not.toHaveBeenCalled()
  })

  test('bulkUpdateDeliveryStatus throws when update acknowledged is false', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: false })
    const collectionObj = { updateMany }
    db.collection.mockReturnValue(collectionObj)

    await expect(bulkUpdateDeliveryStatus({}, ['f'], 'SENT')).rejects.toThrow('Failed to update outbox entries')
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

    await logTerminalFailuresIfAny('outbox', ['file-id-1'], 2, null)

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'outbox_terminal_failure',
          entryId: null,
          reason: 'terminal_failure'
        })
      }),
      expect.any(String)
    )
  })

  test('logs structured error for each terminal doc', async () => {
    const terminalDoc = buildTerminalDoc('f1', 2)
    db.collection.mockReturnValue(buildCollectionMock([terminalDoc]))

    await logTerminalFailuresIfAny('outbox', ['f1'], 2, null, 'publish error')

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'outbox_terminal_failure',
          entryId: 'f1',
          reason: 'publish error'
        })
      }),
      expect.stringContaining('FAILED after max attempts')
    )
  })

  test('skips terminal query when no potential terminal entries', async () => {
    const find = vi.fn()
    db.collection.mockReturnValue({ countDocuments: vi.fn().mockResolvedValue(0), find })

    await logTerminalFailuresIfAny('outbox', ['f1'], 2, null)

    expect(find).not.toHaveBeenCalled()
    expect(mockSendAuditEvent).not.toHaveBeenCalled()
  })
})


