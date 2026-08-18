export const PENDING = 'PENDING'
export const PROCESSING = 'PROCESSING'
export const SENT = 'SENT'
export const PERMANENT_FAILURE = 'PERMANENT_FAILURE'
export const BATCH_SIZE = 10

// Outcome of a single delivery attempt. Never persisted; the resulting status
// is derived in buildClaimedFailurePipeline from the attempt count.
export const DELIVERY_OUTCOME = Object.freeze({
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED'
})
