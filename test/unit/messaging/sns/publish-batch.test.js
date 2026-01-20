import { describe, test, expect, vi, beforeEach } from 'vitest'
import { PublishBatchCommand } from '@aws-sdk/client-sns'
import { publishBatch } from '../../../../src/messaging/sns/publish-batch.js'

vi.mock('@aws-sdk/client-sns', () => ({
  PublishBatchCommand: vi.fn()
}))

describe('publishBatch', () => {
  let mockSnsClient
  const mockTopicArn = 'arn:aws:sns:eu-west-2:000000000000:test-topic'

  beforeEach(() => {
    vi.clearAllMocks()

    mockSnsClient = {
      send: vi.fn()
    }
  })

  test('should publish batch of messages and return response', async () => {
    const mockBatch = [
      {
        id: 'msg-1',
        source: 'test-service',
        type: 'test.event',
        data: {
          messageId: 'message-id-1',
          payload: { test: 'data1' }
        }
      },
      {
        id: 'msg-2',
        source: 'test-service',
        type: 'test.event',
        data: {
          messageId: 'message-id-2',
          payload: { test: 'data2' }
        }
      }
    ]

    const mockResponse = {
      Successful: [
        { Id: 'message-id-1', MessageId: 'sns-msg-1', SequenceNumber: '1' },
        { Id: 'message-id-2', MessageId: 'sns-msg-2', SequenceNumber: '2' }
      ],
      Failed: []
    }

    mockSnsClient.send.mockResolvedValue(mockResponse)

    const result = await publishBatch(mockSnsClient, mockTopicArn, mockBatch)

    expect(result).toEqual(mockResponse)
    expect(mockSnsClient.send).toHaveBeenCalledTimes(1)
  })

  test('should map batch messages to SNS PublishBatchRequestEntries format', async () => {
    const mockBatch = [
      {
        id: 'msg-1',
        source: 'test-service',
        type: 'test.event',
        data: {
          messageId: 'message-id-1',
          payload: { test: 'data' }
        }
      }
    ]

    await publishBatch(mockSnsClient, mockTopicArn, mockBatch)

    expect(PublishBatchCommand).toHaveBeenCalledWith({
      TopicArn: mockTopicArn,
      PublishBatchRequestEntries: [
        {
          Id: 'message-id-1',
          Message: JSON.stringify(mockBatch[0])
        }
      ]
    })
  })

  test('should handle multiple messages in batch', async () => {
    const mockBatch = Array.from({ length: 10 }, (_, i) => ({
      id: `msg-${i}`,
      data: {
        messageId: `message-id-${i}`,
        payload: { index: i }
      }
    }))

    mockSnsClient.send.mockResolvedValue({
      Successful: mockBatch.map((msg, i) => ({
        Id: msg.data.messageId,
        MessageId: `sns-${i}`
      })),
      Failed: []
    })

    await publishBatch(mockSnsClient, mockTopicArn, mockBatch)

    expect(PublishBatchCommand).toHaveBeenCalledWith({
      TopicArn: mockTopicArn,
      PublishBatchRequestEntries: expect.arrayContaining([
        expect.objectContaining({ Id: 'message-id-0' }),
        expect.objectContaining({ Id: 'message-id-9' })
      ])
    })
    expect(PublishBatchCommand.mock.calls[0][0].PublishBatchRequestEntries).toHaveLength(10)
  })

  test('should throw error when SNS send fails', async () => {
    const mockBatch = [
      {
        id: 'msg-1',
        data: { messageId: 'message-id-1' }
      }
    ]

    const mockError = new Error('SNS service unavailable')
    mockSnsClient.send.mockRejectedValue(mockError)

    await expect(publishBatch(mockSnsClient, mockTopicArn, mockBatch))
      .rejects.toThrow('SNS service unavailable')
  })

  test('should return response with failed messages', async () => {
    const mockBatch = [
      {
        id: 'msg-1',
        data: { messageId: 'message-id-1' }
      },
      {
        id: 'msg-2',
        data: { messageId: 'message-id-2' }
      }
    ]

    const mockResponse = {
      Successful: [
        { Id: 'message-id-1', MessageId: 'sns-msg-1' }
      ],
      Failed: [
        {
          Id: 'message-id-2',
          Code: 'InternalError',
          Message: 'Failed to publish',
          SenderFault: false
        }
      ]
    }

    mockSnsClient.send.mockResolvedValue(mockResponse)

    const result = await publishBatch(mockSnsClient, mockTopicArn, mockBatch)

    expect(result).toEqual(mockResponse)
    expect(result.Successful).toHaveLength(1)
    expect(result.Failed).toHaveLength(1)
  })

  test('should handle empty batch', async () => {
    const mockBatch = []

    mockSnsClient.send.mockResolvedValue({ Successful: [], Failed: [] })

    await publishBatch(mockSnsClient, mockTopicArn, mockBatch)

    expect(PublishBatchCommand).toHaveBeenCalledWith({
      TopicArn: mockTopicArn,
      PublishBatchRequestEntries: []
    })
  })
})
