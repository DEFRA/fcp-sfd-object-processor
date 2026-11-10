const serialisedByteLength = (message) => Buffer.byteLength(JSON.stringify(message), 'utf8')

/**
 * Packs messages into batches whose serialised size stays within a limit.
 *
 * The size is measured on `JSON.stringify(message)`, the same string
 * `publishBatch` sends as the SNS `Message`. Messages are packed greedily in
 * input order. A message that is over the limit on its own is returned in
 * `oversized` and is not placed in any batch.
 *
 * @param {object[]} messages built CloudEvents messages
 * @param {number} maxBytes limit for one message and for a batch total
 * @returns {{ batches: object[][], oversized: { message: object, bytes: number }[] }}
 */
export const splitBatchBySize = (messages, maxBytes) => {
  const batches = []
  const oversized = []
  let currentBatch = []
  let currentBytes = 0

  for (const message of messages) {
    const bytes = serialisedByteLength(message)

    if (bytes > maxBytes) {
      oversized.push({ message, bytes })
      continue
    }

    if (currentBytes + bytes > maxBytes) {
      batches.push(currentBatch)
      currentBatch = []
      currentBytes = 0
    }

    currentBatch.push(message)
    currentBytes += bytes
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return { batches, oversized }
}
