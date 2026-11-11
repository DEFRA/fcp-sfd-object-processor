export const PENDING = 'PENDING'
export const PROCESSING = 'PROCESSING'
export const SENT = 'SENT'
export const PERMANENT_FAILURE = 'PERMANENT_FAILURE'
export const BATCH_SIZE = 10

// AWS PublishBatch default for one message and for the batch total. The topic
// has no MaximumMessageSize override (cdp-tenant-config).
export const SNS_MAX_PAYLOAD_BYTES = 262144

// Headroom for anything SNS counts that the splitter does not. The service sends
// no message attributes, so the documented count is the message body only.
// 16 KiB leaves 240 KiB for packing, far above the roughly 2 KB a bounded
// message reaches.
export const SNS_PAYLOAD_SAFETY_MARGIN_BYTES = 16384

// Code on the Failed entry for a message the publisher refuses to send because
// it is over the SNS size limit.
export const MESSAGE_TOO_LARGE_CODE = 'OutboxMessageTooLarge'

// Outcome of a single delivery attempt. Never persisted; the resulting status
// is derived in buildClaimedFailurePipeline from the attempt count.
export const DELIVERY_OUTCOME = Object.freeze({
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED'
})
