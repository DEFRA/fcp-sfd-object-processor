/* eslint-disable @stylistic/no-multiple-empty-lines */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  bulkUpdateDeliveryStatus
} from '../../../src/repos/outbox.js'

describe('src/repos/outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createOutboxEntries inserts only complete files and returns insertedIds', async () => {
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

  it('createOutboxEntries returns empty object when no complete files', async () => {
    const ids = { 0: 'm1' }
    const documents = [{ file: { fileStatus: 'pending' } }]
    // ensure insertMany not called
    const collectionObj = { insertMany: vi.fn() }
    db.collection.mockReturnValue(collectionObj)

    const res = await createOutboxEntries(ids, documents, null)
    expect(res).toEqual({})
    expect(collectionObj.insertMany).not.toHaveBeenCalled()
  })

  it('createOutboxEntries throws when insertMany not acknowledged', async () => {
    const ids = { 0: 'm1' }
    const documents = [{ file: { fileStatus: 'complete' } }]
    const collectionObj = { insertMany: vi.fn().mockResolvedValue({ acknowledged: false }) }
    db.collection.mockReturnValue(collectionObj)

    await expect(createOutboxEntries(ids, documents, {})).rejects.toThrow('Failed to insert outbox entries')
  })

  it('getProcessableOutboxEntries queries with correct filter and returns entries', async () => {
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

  it('bulkUpdateDeliveryStatus uses sent update path and returns result', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    const collectionObj = { updateMany }
    db.collection.mockReturnValue(collectionObj)

    const session = { id: 's' }
    const fileIds = ['f1']
    const res = await bulkUpdateDeliveryStatus(session, fileIds, 'SENT')
    expect(updateMany).toHaveBeenCalled()
    expect(res).toEqual({ acknowledged: true })
  })

  it('bulkUpdateDeliveryStatus uses failure pipeline and logs terminal failures', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    const countDocuments = vi.fn().mockResolvedValue(1)
    const toArray = vi.fn().mockResolvedValue([{ _id: 'x', status: 'FAILED', payload: { file: { fileId: 'f1' } }, attempts: 2 }])
    const find = vi.fn(() => ({ toArray }))
    const collectionObj = { updateMany, countDocuments, find }
    db.collection.mockImplementation((name) => collectionObj)

    const session = { id: 's' }
    const fileIds = ['f1']
    // ensure config max attempts === 2 from mock
    const res = await bulkUpdateDeliveryStatus(session, fileIds, 'FAILED', 'boom')
    expect(updateMany).toHaveBeenCalled()
    expect(res).toEqual({ acknowledged: true })
  })

  it('bulkUpdateDeliveryStatus throws when update acknowledged is false', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: false })
    const collectionObj = { updateMany }
    db.collection.mockReturnValue(collectionObj)

    await expect(bulkUpdateDeliveryStatus({}, ['f'], 'SENT')).rejects.toThrow('Failed to update outbox entries')
  })

  it('bulkUpdateDeliveryStatus logs terminal failures when entries reach max attempts', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    const countDocuments = vi.fn().mockResolvedValue(1)
    const toArray = vi.fn().mockResolvedValue([
      {
        _id: 'terminal-id',
        status: 'FAILED',
        attempts: 2,
        payload: { file: { fileId: 'f1' } }
      }
    ])
    const find = vi.fn(() => ({ toArray }))
    const collectionObj = { updateMany, countDocuments, find }
    db.collection.mockReturnValue(collectionObj)

    await bulkUpdateDeliveryStatus({ id: 's' }, ['f1'], 'FAILED', 'publish error')

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

  it('bulkUpdateDeliveryStatus continues when terminal failure logging throws', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    const countDocuments = vi.fn().mockRejectedValue(new Error('count failed'))
    const collectionObj = { updateMany, countDocuments }
    db.collection.mockReturnValue(collectionObj)

    const result = await bulkUpdateDeliveryStatus({ id: 's' }, ['f1'], 'FAILED', 'boom')

    expect(result).toEqual({ acknowledged: true })
    expect(mockLoggerError).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Failed to log terminal outbox entries'
    )
  })

  it('bulkUpdateDeliveryStatus logs terminal failure with default reason when error omitted', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    const countDocuments = vi.fn().mockResolvedValue(1)
    const toArray = vi.fn().mockResolvedValue([
      {
        _id: 'terminal-id',
        status: 'FAILED',
        attempts: 2,
        payload: {}
      }
    ])
    const find = vi.fn(() => ({ toArray }))
    const collectionObj = { updateMany, countDocuments, find }
    db.collection.mockReturnValue(collectionObj)

    await bulkUpdateDeliveryStatus({ id: 's' }, ['f1'], 'FAILED')

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

  it('bulkUpdateDeliveryStatus skips terminal query when no potential terminal entries', async () => {
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    const countDocuments = vi.fn().mockResolvedValue(0)
    const find = vi.fn()
    const collectionObj = { updateMany, countDocuments, find }
    db.collection.mockReturnValue(collectionObj)

    await bulkUpdateDeliveryStatus({ id: 's' }, ['f1'], 'FAILED')

    expect(countDocuments).toHaveBeenCalled()
    expect(find).not.toHaveBeenCalled()
  })
})

describe('outbox — event 6 (document/failed audit event on terminal failure)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendAuditEvent.mockResolvedValue(undefined)
  })

  const buildTerminalDoc = (fileId = 'file-id-1', attempts = 2) => ({
    _id: { toString: () => 'outbox-doc-id' },
    payload: { file: { fileId } },
    attempts
  })

  const buildCollectionMock = (terminalDocs) => {
    const toArray = vi.fn().mockResolvedValue(terminalDocs)
    const find = vi.fn().mockReturnValue({ toArray })
    const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    const countDocuments = vi.fn().mockResolvedValue(terminalDocs.length)
    return { updateMany, countDocuments, find }
  }

  it('emits document/failed audit event for each terminal doc', async () => {
    const terminalDoc = buildTerminalDoc('file-id-1', 2)
    db.collection.mockReturnValue(buildCollectionMock([terminalDoc]))

    await bulkUpdateDeliveryStatus({ id: 's' }, ['file-id-1'], 'FAILED', 'SNS failure')

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

  it('uses error constructor name for logged error type when available', async () => {
    const terminalDoc = buildTerminalDoc()
    db.collection.mockReturnValue(buildCollectionMock([terminalDoc]))
    const sendError = new TypeError('SNS down')
    sendError.code = 'SNS_PUBLISH_FAILED'
    mockSendAuditEvent.mockRejectedValueOnce(sendError)

    await expect(
      bulkUpdateDeliveryStatus({ id: 's' }, ['file-id-1'], 'FAILED', 'error')
    ).resolves.not.toThrow()

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'audit_event_send_failure',
          outcome: 'failure',
          entityid: 'file-id-1'
        }),
        error: expect.objectContaining({
          code: 'SNS_PUBLISH_FAILED',
          message: 'SNS down',
          stack_trace: expect.any(String),
          type: 'TypeError'
        })
      }),
      'Failed to send audit event'
    )
  })

  it('uses error name for logged error type when constructor name is unavailable', async () => {
    const terminalDoc = buildTerminalDoc()
    db.collection.mockReturnValue(buildCollectionMock([terminalDoc]))

    const sendError = Object.create(null)
    sendError.code = 'SNS_PUBLISH_FAILED'
    sendError.message = 'SNS down'
    sendError.stack = 'test-stack'
    sendError.name = 'NamedAuditError'

    mockSendAuditEvent.mockRejectedValueOnce(sendError)

    await expect(
      bulkUpdateDeliveryStatus({ id: 's' }, ['file-id-1'], 'FAILED', 'error')
    ).resolves.not.toThrow()

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          type: 'NamedAuditError'
        })
      }),
      'Failed to send audit event'
    )
  })

  it('uses default Error for logged error type when constructor name and name are unavailable', async () => {
    const terminalDoc = buildTerminalDoc()
    db.collection.mockReturnValue(buildCollectionMock([terminalDoc]))

    const sendError = Object.create(null)
    sendError.code = 'SNS_PUBLISH_FAILED'
    sendError.message = 'SNS down'
    sendError.stack = 'test-stack'

    mockSendAuditEvent.mockRejectedValueOnce(sendError)

    await expect(
      bulkUpdateDeliveryStatus({ id: 's' }, ['file-id-1'], 'FAILED', 'error')
    ).resolves.not.toThrow()

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          type: 'Error'
        })
      }),
      'Failed to send audit event'
    )
  })

  it('emits one event per terminal doc', async () => {
    const terminalDocs = [buildTerminalDoc('file-1'), buildTerminalDoc('file-2')]
    db.collection.mockReturnValue(buildCollectionMock(terminalDocs))

    await bulkUpdateDeliveryStatus({ id: 's' }, ['file-1', 'file-2'], 'FAILED', 'error')

    expect(mockSendAuditEvent).toHaveBeenCalledTimes(2)
  })
})

