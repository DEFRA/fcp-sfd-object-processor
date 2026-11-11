import { describe, expect, test } from 'vitest'
import { splitBatchBySize } from '../../../../src/messaging/outbound/crm/doc-upload/split-batch-by-size.js'

const serialisedBytes = (message) => Buffer.byteLength(JSON.stringify(message), 'utf8')

const EMPTY_PADDING_BYTES = serialisedBytes({ id: 'wide', padding: '' })

// Builds a message whose serialised form is exactly `totalBytes` bytes long.
// The id is part of the serialised form, so it is included in the measurement.
const buildMessageOfSize = (id, totalBytes) => ({
  id,
  padding: 'x'.repeat(totalBytes - serialisedBytes({ id, padding: '' }))
})

const idsOf = (batches) => batches.map(batch => batch.map(message => message.id))

describe('splitBatchBySize', () => {
  const maxBytes = 1000

  test('should return no batches and nothing oversized for an empty input', () => {
    expect(splitBatchBySize([], maxBytes)).toEqual({ batches: [], oversized: [] })
  })

  test('should keep messages that fit in one batch, in input order', () => {
    const messages = [
      buildMessageOfSize('a', 100),
      buildMessageOfSize('b', 100),
      buildMessageOfSize('c', 100)
    ]

    const { batches, oversized } = splitBatchBySize(messages, maxBytes)

    expect(idsOf(batches)).toEqual([['a', 'b', 'c']])
    expect(oversized).toEqual([])
  })

  test('should split into several batches without losing or repeating a message', () => {
    const messages = ['a', 'b', 'c', 'd', 'e'].map(id => buildMessageOfSize(id, 400))

    const { batches, oversized } = splitBatchBySize(messages, maxBytes)

    expect(idsOf(batches)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
    expect(oversized).toEqual([])
  })

  test('should keep every batch total at or under the limit', () => {
    const messages = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => buildMessageOfSize(id, 350))

    const { batches } = splitBatchBySize(messages, maxBytes)

    for (const batch of batches) {
      const total = batch.reduce((sum, message) => sum + serialisedBytes(message), 0)
      expect(total).toBeLessThanOrEqual(maxBytes)
    }
  })

  test('should isolate a single oversized message and report its byte count', () => {
    const big = buildMessageOfSize('big', maxBytes + 500)

    const { batches, oversized } = splitBatchBySize([big], maxBytes)

    expect(batches).toEqual([])
    expect(oversized).toEqual([{ message: big, bytes: maxBytes + 500 }])
  })

  test('should isolate the oversized message and still batch the others in order', () => {
    const messages = [
      buildMessageOfSize('a', 200),
      buildMessageOfSize('big', maxBytes + 1),
      buildMessageOfSize('b', 200)
    ]

    const { batches, oversized } = splitBatchBySize(messages, maxBytes)

    expect(idsOf(batches)).toEqual([['a', 'b']])
    expect(oversized.map(item => item.message.id)).toEqual(['big'])
  })

  test('should return every message as oversized and no batches when all are too large', () => {
    const messages = [
      buildMessageOfSize('a', maxBytes + 1),
      buildMessageOfSize('b', maxBytes + 2)
    ]

    const { batches, oversized } = splitBatchBySize(messages, maxBytes)

    expect(batches).toEqual([])
    expect(oversized.map(item => item.message.id)).toEqual(['a', 'b'])
  })

  describe('boundaries', () => {
    test('should accept a single message exactly at the limit', () => {
      const exact = buildMessageOfSize('exact', maxBytes)

      const { batches, oversized } = splitBatchBySize([exact], maxBytes)

      expect(idsOf(batches)).toEqual([['exact']])
      expect(oversized).toEqual([])
    })

    test('should treat a single message one byte over the limit as oversized', () => {
      const over = buildMessageOfSize('over', maxBytes + 1)

      const { batches, oversized } = splitBatchBySize([over], maxBytes)

      expect(batches).toEqual([])
      expect(oversized).toHaveLength(1)
    })

    test('should keep two messages together when their total equals the limit', () => {
      const messages = [
        buildMessageOfSize('a', maxBytes / 2),
        buildMessageOfSize('b', maxBytes / 2)
      ]

      const { batches } = splitBatchBySize(messages, maxBytes)

      expect(idsOf(batches)).toEqual([['a', 'b']])
    })

    test('should start a new batch when adding a message would exceed the limit by one byte', () => {
      const messages = [
        buildMessageOfSize('a', maxBytes / 2),
        buildMessageOfSize('b', maxBytes / 2 + 1)
      ]

      const { batches } = splitBatchBySize(messages, maxBytes)

      expect(idsOf(batches)).toEqual([['a'], ['b']])
    })
  })

  describe('multi byte content', () => {
    test('should count bytes, not characters', () => {
      const characters = 100
      const message = { id: 'wide', padding: 'é'.repeat(characters) }
      const limit = EMPTY_PADDING_BYTES + 150

      expect(JSON.stringify(message).length).toBeLessThanOrEqual(limit)
      expect(serialisedBytes(message)).toBeGreaterThan(limit)

      const { batches, oversized } = splitBatchBySize([message], limit)

      expect(batches).toEqual([])
      expect(oversized).toEqual([{ message, bytes: serialisedBytes(message) }])
    })
  })
})
