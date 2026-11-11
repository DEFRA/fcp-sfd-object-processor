import { beforeEach, describe, expect, vi, test } from 'vitest'

import { BatchRequestTooLongException } from '@aws-sdk/client-sns'
import { createLogger } from '../../../../src/logging/logger.js'
import { snsClient } from '../../../../src/messaging/sns/client.js'
import { publishBatch } from '../../../../src/messaging/sns/publish-batch.js'
import { buildDocumentUploadMessageBatch } from '../../../../src/messaging/outbound/crm/doc-upload/build-document-upload-message-batch.js'
import { publishDocumentUploadMessageBatch } from '../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message-batch.js'
import { getCorrelationId } from '../../../../src/logging/correlation-id-store.js'
import {
  MESSAGE_TOO_LARGE_CODE,
  SNS_MAX_PAYLOAD_BYTES,
  SNS_PAYLOAD_SAFETY_MARGIN_BYTES
} from '../../../../src/constants/outbox.js'

vi.mock('../../../../src/messaging/sns/client.js')
vi.mock('../../../../src/messaging/sns/publish-batch.js')
vi.mock('../../../../src/messaging/outbound/crm/doc-upload/build-document-upload-message-batch.js')
vi.mock('../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'aws.messaging.topics.documentUploadEvents') {
        return 'arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events'
      }
      return null
    })
  }
}))

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

const mockLogger = createLogger()

const mockPendingMessages = [{
  _id: 'message-id-1',
  messageId: 'metadata-id-1',
  payload: {},
  status: 'pending'
}]

const mockMessageBatch = [{
  cloudEventsFormat: 'cloud-events'
}]

describe('Publish Received Message', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should publish a message batch', async () => {
    buildDocumentUploadMessageBatch.mockReturnValue(mockMessageBatch)
    publishBatch.mockResolvedValue({
      successful: [{ id: 'id-1', messageId: 'message-id-1', sequenceNumber: 1 }],
      failed: []
    })

    await publishDocumentUploadMessageBatch(mockPendingMessages)

    expect(buildDocumentUploadMessageBatch).toHaveBeenCalledWith(mockPendingMessages)

    expect(publishBatch).toHaveBeenCalledWith(
      snsClient,
      'arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events',
      mockMessageBatch
    )
  })

  test('should return the Successful and Failed arrays from publishBatch', async () => {
    buildDocumentUploadMessageBatch.mockReturnValue(mockMessageBatch)
    publishBatch.mockResolvedValue({
      Successful: [{ Id: 'id-1', MessageId: 'message-id-1', SequenceNumber: '1' }],
      Failed: [{ Id: 'id-2', Code: 'InternalError', Message: 'broken' }]
    })

    const result = await publishDocumentUploadMessageBatch(mockPendingMessages)

    expect(result).toEqual({
      Successful: [{ Id: 'id-1', MessageId: 'message-id-1', SequenceNumber: '1' }],
      Failed: [{ Id: 'id-2', Code: 'InternalError', Message: 'broken' }]
    })
  })

  test('should log and return synthesised Failed array when publishBatch throws', async () => {
    const mockError = new Error('Publish error')
    buildDocumentUploadMessageBatch.mockReturnValue(mockMessageBatch)
    publishBatch.mockRejectedValue(mockError)

    const result = await publishDocumentUploadMessageBatch(mockPendingMessages)

    expect(mockLogger.error).toHaveBeenCalledWith(mockError, 'Error publishing document upload batch')
    expect(result).toEqual({
      Successful: [],
      Failed: [{ Id: 'metadata-id-1', Code: 'Error', Message: 'Publish error' }]
    })
  })

  test('synthesised Failed entry uses payload.file.fileId as Id when present', async () => {
    const messages = [{ payload: { file: { fileId: 'file-abc' } }, messageId: 'msg-abc' }]
    publishBatch.mockRejectedValue(new Error('sns down'))
    buildDocumentUploadMessageBatch.mockReturnValue(mockMessageBatch)

    const result = await publishDocumentUploadMessageBatch(messages)

    expect(result.Failed[0].Id).toBe('file-abc')
  })

  test('synthesised Failed entry falls back to messageId when fileId absent', async () => {
    const messages = [{ messageId: 'msg-fallback' }]
    publishBatch.mockRejectedValue(new Error('sns down'))
    buildDocumentUploadMessageBatch.mockReturnValue(mockMessageBatch)

    const result = await publishDocumentUploadMessageBatch(messages)

    expect(result.Failed[0].Id).toBe('msg-fallback')
  })

  test('synthesised Failed entry Id is undefined when both fileId and messageId are absent', async () => {
    const messages = [{ payload: {} }]
    publishBatch.mockRejectedValue(new Error('sns down'))
    buildDocumentUploadMessageBatch.mockReturnValue(mockMessageBatch)

    const result = await publishDocumentUploadMessageBatch(messages)

    expect(result.Failed[0].Id).toBeUndefined()
  })

  test('synthesised Failed entry uses err.constructor.name as Code when present', async () => {
    class BatchRequestTooLongException extends Error {}
    const err = new BatchRequestTooLongException('too long')
    publishBatch.mockRejectedValue(err)
    buildDocumentUploadMessageBatch.mockReturnValue(mockMessageBatch)

    const result = await publishDocumentUploadMessageBatch(mockPendingMessages)

    expect(result.Failed[0].Code).toBe('BatchRequestTooLongException')
    expect(result.Failed[0].Message).toBe('too long')
  })

  test('synthesised Failed entry falls back to err.name as Code when constructor.name is absent', async () => {
    const err = Object.create(null)
    err.message = 'sns down'
    err.name = 'SpecialError'
    publishBatch.mockRejectedValue(err)
    buildDocumentUploadMessageBatch.mockReturnValue(mockMessageBatch)

    const result = await publishDocumentUploadMessageBatch(mockPendingMessages)

    expect(result.Failed[0].Code).toBe('SpecialError')
  })

  test('synthesised Failed entry falls back to PublishError as Code when both constructor.name and err.name are absent', async () => {
    const err = Object.create(null)
    err.message = 'sns down'
    publishBatch.mockRejectedValue(err)
    buildDocumentUploadMessageBatch.mockReturnValue(mockMessageBatch)

    const result = await publishDocumentUploadMessageBatch(mockPendingMessages)

    expect(result.Failed[0].Code).toBe('PublishError')
  })
})

const SNS_TOPIC = 'arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events'
const EFFECTIVE_LIMIT_BYTES = SNS_MAX_PAYLOAD_BYTES - SNS_PAYLOAD_SAFETY_MARGIN_BYTES
const OVERSIZED_SENTINEL = 'SENTINEL-OVERSIZED-REFERENCE'

const buildEntry = (n) => ({
  _id: `outbox-id-${n}`,
  messageId: `metadata-id-${n}`,
  payload: { file: { fileId: `file-${n}` }, messaging: { correlationId: `corr-${n}` } }
})

const buildNormalMessage = (n) => ({ id: `file-${n}`, title: `reference ${n}` })

const buildOversizedMessage = (n) => ({
  id: `file-${n}`,
  title: `${OVERSIZED_SENTINEL} ${'x'.repeat(SNS_MAX_PAYLOAD_BYTES)}`
})

const publishEverything = async (_client, _topic, batch) => ({
  Successful: batch.map(message => ({ Id: message.id })),
  Failed: []
})

describe('oversized message isolation', () => {
  const entries = [buildEntry(1), buildEntry(2), buildEntry(3)]

  beforeEach(() => {
    vi.clearAllMocks()
    publishBatch.mockReset()
    publishBatch.mockImplementation(publishEverything)
    buildDocumentUploadMessageBatch.mockReturnValue([
      buildNormalMessage(1),
      buildOversizedMessage(2),
      buildNormalMessage(3)
    ])
  })

  test('should send only the in-limit messages to SNS', async () => {
    await publishDocumentUploadMessageBatch(entries)

    expect(publishBatch).toHaveBeenCalledTimes(1)
    expect(publishBatch).toHaveBeenCalledWith(snsClient, SNS_TOPIC, [buildNormalMessage(1), buildNormalMessage(3)])
  })

  test('should report the in-limit messages as Successful', async () => {
    const result = await publishDocumentUploadMessageBatch(entries)

    expect(result.Successful).toEqual([{ Id: 'file-1' }, { Id: 'file-3' }])
  })

  test('should fail only the oversized entry, with a message holding byte counts only', async () => {
    const bytes = Buffer.byteLength(JSON.stringify(buildOversizedMessage(2)), 'utf8')

    const result = await publishDocumentUploadMessageBatch(entries)

    expect(result.Failed).toEqual([{
      Id: 'file-2',
      Code: MESSAGE_TOO_LARGE_CODE,
      Message: `message_exceeds_sns_limit bytes=${bytes} limit=${EFFECTIVE_LIMIT_BYTES}`
    }])
  })

  test('should not put any part of the oversized message in the Failed entry or any log call', async () => {
    const result = await publishDocumentUploadMessageBatch(entries)

    const logged = JSON.stringify([
      ...mockLogger.info.mock.calls,
      ...mockLogger.warn.mock.calls,
      ...mockLogger.error.mock.calls
    ])
    expect(JSON.stringify(result.Failed)).not.toContain(OVERSIZED_SENTINEL)
    expect(logged).not.toContain(OVERSIZED_SENTINEL)
  })

  test('should log one warning per oversized entry with nested event fields and the outbox id as reference', async () => {
    await publishDocumentUploadMessageBatch(entries)

    expect(mockLogger.warn).toHaveBeenCalledTimes(1)
    expect(mockLogger.warn).toHaveBeenCalledWith({
      event: {
        type: 'outbox_message_too_large',
        action: 'size_check',
        outcome: 'failure',
        reference: 'outbox-id-2'
      }
    }, expect.stringContaining(`limit=${EFFECTIVE_LIMIT_BYTES}`))
  })

  test('should log the warning under the correlation id of the oversized entry', async () => {
    let correlationIdDuringLog
    mockLogger.warn.mockImplementationOnce(() => { correlationIdDuringLog = getCorrelationId() })

    await publishDocumentUploadMessageBatch(entries)

    expect(correlationIdDuringLog).toBe('corr-2')
  })

  test('should not log a size warning when every message is within the limit', async () => {
    buildDocumentUploadMessageBatch.mockReturnValue([buildNormalMessage(1), buildNormalMessage(2), buildNormalMessage(3)])

    await publishDocumentUploadMessageBatch(entries)

    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  test('should not call SNS when every message is oversized', async () => {
    buildDocumentUploadMessageBatch.mockReturnValue([buildOversizedMessage(1), buildOversizedMessage(2), buildOversizedMessage(3)])

    const result = await publishDocumentUploadMessageBatch(entries)

    expect(publishBatch).not.toHaveBeenCalled()
    expect(result.Successful).toEqual([])
    expect(result.Failed.map(failure => failure.Id)).toEqual(['file-1', 'file-2', 'file-3'])
  })

  test('should identify an oversized entry by messageId when it has no fileId', async () => {
    const entryWithoutFileId = { _id: 'outbox-id-9', messageId: 'metadata-id-9', payload: {} }
    buildDocumentUploadMessageBatch.mockReturnValue([buildOversizedMessage(9)])

    const result = await publishDocumentUploadMessageBatch([entryWithoutFileId])

    expect(result.Failed[0].Id).toBe('metadata-id-9')
  })
})

describe('batches bounded by total size', () => {
  const entries = [1, 2, 3, 4].map(buildEntry)
  const largeMessage = (n) => ({ id: `file-${n}`, title: 'x'.repeat(100000) })

  class ThrottlingException extends Error {}

  beforeEach(() => {
    vi.clearAllMocks()
    publishBatch.mockReset()
    publishBatch.mockImplementation(publishEverything)
    buildDocumentUploadMessageBatch.mockReturnValue([1, 2, 3, 4].map(largeMessage))
  })

  test('should publish messages whose total exceeds the limit in more than one call', async () => {
    await publishDocumentUploadMessageBatch(entries)

    expect(publishBatch).toHaveBeenCalledTimes(2)
    expect(publishBatch).toHaveBeenNthCalledWith(1, snsClient, SNS_TOPIC, [largeMessage(1), largeMessage(2)])
    expect(publishBatch).toHaveBeenNthCalledWith(2, snsClient, SNS_TOPIC, [largeMessage(3), largeMessage(4)])
  })

  test('should return every entry as Successful exactly once across the calls', async () => {
    const result = await publishDocumentUploadMessageBatch(entries)

    expect(result.Successful.map(success => success.Id)).toEqual(['file-1', 'file-2', 'file-3', 'file-4'])
    expect(result.Failed).toEqual([])
  })

  test('should fail only the entries of a sub-batch that throws, and still publish the others', async () => {
    const throttled = new ThrottlingException('Rate exceeded')
    publishBatch.mockRejectedValueOnce(throttled)

    const result = await publishDocumentUploadMessageBatch(entries)

    expect(result.Failed).toEqual([
      { Id: 'file-1', Code: 'ThrottlingException', Message: 'Rate exceeded' },
      { Id: 'file-2', Code: 'ThrottlingException', Message: 'Rate exceeded' }
    ])
    expect(result.Successful.map(success => success.Id)).toEqual(['file-3', 'file-4'])
    expect(mockLogger.error).toHaveBeenCalledWith(throttled, 'Error publishing document upload batch')
  })

  test('should not retry entry by entry after an error that is not a size rejection', async () => {
    publishBatch.mockRejectedValue(new ThrottlingException('Rate exceeded'))
    buildDocumentUploadMessageBatch.mockReturnValue([largeMessage(1), largeMessage(2)])

    const result = await publishDocumentUploadMessageBatch([buildEntry(1), buildEntry(2)])

    expect(publishBatch).toHaveBeenCalledTimes(1)
    expect(result.Failed.map(failure => failure.Id)).toEqual(['file-1', 'file-2'])
  })

  test('should return an empty Failed array when SNS reports only successes', async () => {
    publishBatch.mockResolvedValue({ Successful: [{ Id: 'file-1' }] })
    buildDocumentUploadMessageBatch.mockReturnValue([largeMessage(1)])

    const result = await publishDocumentUploadMessageBatch([buildEntry(1)])

    expect(result).toEqual({ Successful: [{ Id: 'file-1' }], Failed: [] })
  })

  test('should return an empty Successful array when SNS reports only failures', async () => {
    publishBatch.mockResolvedValue({ Failed: [{ Id: 'file-1', Code: 'InternalError', Message: 'broken' }] })
    buildDocumentUploadMessageBatch.mockReturnValue([largeMessage(1)])

    const result = await publishDocumentUploadMessageBatch([buildEntry(1)])

    expect(result).toEqual({ Successful: [], Failed: [{ Id: 'file-1', Code: 'InternalError', Message: 'broken' }] })
  })

  test('should fail every entry and not call SNS when building the messages throws', async () => {
    const buildError = new Error('bad payload')
    buildDocumentUploadMessageBatch.mockImplementationOnce(() => { throw buildError })

    const result = await publishDocumentUploadMessageBatch([buildEntry(1), buildEntry(2)])

    expect(publishBatch).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(buildError, 'Error publishing document upload batch')
    expect(result).toEqual({
      Successful: [],
      Failed: [
        { Id: 'file-1', Code: 'Error', Message: 'bad payload' },
        { Id: 'file-2', Code: 'Error', Message: 'bad payload' }
      ]
    })
  })
})

describe('fallback after SNS rejects a sub-batch as too long', () => {
  const entries = [1, 2, 3].map(buildEntry)
  const tooLong = () => new BatchRequestTooLongException({ message: 'Batch too long', $metadata: {} })
  const batchIds = (callArgs) => callArgs[2].map(message => message.id)
  const callIds = () => publishBatch.mock.calls.map(batchIds)

  const rejectOnlyWhenSingleEntryIs = (rejectedId, error) =>
    async (client, topic, batch) => {
      if (batch.length === 1 && batch[0].id === rejectedId) {
        throw error
      }
      return publishEverything(client, topic, batch)
    }

  beforeEach(() => {
    vi.clearAllMocks()
    publishBatch.mockReset()
    publishBatch.mockImplementation(publishEverything)
    buildDocumentUploadMessageBatch.mockReturnValue([1, 2, 3].map(buildNormalMessage))
  })

  test('should republish the rejected sub-batch one entry per call, in input order', async () => {
    publishBatch.mockRejectedValueOnce(tooLong())

    await publishDocumentUploadMessageBatch(entries)

    expect(callIds()).toEqual([['file-1', 'file-2', 'file-3'], ['file-1'], ['file-2'], ['file-3']])
  })

  test('should report every entry as Successful when each one is accepted on its own', async () => {
    publishBatch.mockRejectedValueOnce(tooLong())

    const result = await publishDocumentUploadMessageBatch(entries)

    expect(result.Successful.map(success => success.Id)).toEqual(['file-1', 'file-2', 'file-3'])
    expect(result.Failed).toEqual([])
  })

  test('should fail only the entry that SNS rejects on its own', async () => {
    publishBatch.mockRejectedValueOnce(tooLong())
    publishBatch.mockImplementation(rejectOnlyWhenSingleEntryIs('file-2', tooLong()))

    const result = await publishDocumentUploadMessageBatch(entries)

    expect(result.Successful.map(success => success.Id)).toEqual(['file-1', 'file-3'])
    expect(result.Failed).toEqual([
      { Id: 'file-2', Code: 'BatchRequestTooLongException', Message: 'Batch too long' }
    ])
  })

  test('should fail only the entry whose single call fails with another error', async () => {
    const boom = new Error('boom')
    publishBatch.mockRejectedValueOnce(tooLong())
    publishBatch.mockImplementation(rejectOnlyWhenSingleEntryIs('file-3', boom))

    const result = await publishDocumentUploadMessageBatch(entries)

    expect(result.Successful.map(success => success.Id)).toEqual(['file-1', 'file-2'])
    expect(result.Failed).toEqual([{ Id: 'file-3', Code: 'Error', Message: 'boom' }])
    expect(mockLogger.error).toHaveBeenCalledWith(boom, 'Error publishing document upload batch')
  })

  test('should not republish a lone entry that SNS rejects as too long', async () => {
    publishBatch.mockRejectedValue(tooLong())
    buildDocumentUploadMessageBatch.mockReturnValue([buildNormalMessage(1)])

    const result = await publishDocumentUploadMessageBatch([buildEntry(1)])

    expect(publishBatch).toHaveBeenCalledTimes(1)
    expect(result.Failed).toEqual([
      { Id: 'file-1', Code: 'BatchRequestTooLongException', Message: 'Batch too long' }
    ])
  })

  test('should leave the other sub-batches untouched by the fallback', async () => {
    const largeMessage = (n) => ({ id: `file-${n}`, title: 'x'.repeat(100000) })
    buildDocumentUploadMessageBatch.mockReturnValue([1, 2, 3, 4].map(largeMessage))
    publishBatch.mockRejectedValueOnce(tooLong())

    const result = await publishDocumentUploadMessageBatch([1, 2, 3, 4].map(buildEntry))

    expect(callIds()).toEqual([['file-1', 'file-2'], ['file-1'], ['file-2'], ['file-3', 'file-4']])
    expect(result.Successful.map(success => success.Id)).toEqual(['file-1', 'file-2', 'file-3', 'file-4'])
    expect(result.Failed).toEqual([])
  })
})
