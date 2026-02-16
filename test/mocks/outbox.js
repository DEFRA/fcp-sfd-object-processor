/**
 * Outbox Mock Data
 *
 * Represents outbox entries in the transactional outbox pattern.
 * Each entry contains a message payload ready to be published to SNS.
 */
import { ObjectId } from 'mongodb'
import {
  baseMetadata,
  alternateMetadata,
  baseFileUpload3,
  baseFileUpload4,
  createFormattedDocument
} from './base-data.js'

// Correlation IDs for grouping related messages
const correlationId1 = '123e4567-e89b-12d3-a456-426655440000'
const correlationId2 = '123e4567-e89b-12d3-a456-426655440001'

// First pending message - uses baseMetadata and baseFileUpload3
const mockPendingMessageOne = {
  _id: ObjectId.createFromHexString('6970ef40eb614141dffe78cb'),
  messageId: ObjectId.createFromHexString('6970ef40eb614141dffe78c6'),
  payload: {
    ...createFormattedDocument(baseMetadata, baseFileUpload3, {
      correlationId: correlationId1,
      publishedAt: null
    }),
    _id: ObjectId.createFromHexString('6970ef40eb614141dffe78c6')
  },
  status: 'PENDING',
  attempts: 1,
  createdAt: '2026-01-21T15:22:40.280Z',
  lastAttemptedAt: '2026-01-21T15:22:59.407Z'
}

// Second pending message - uses alternateMetadata and baseFileUpload4
const mockPendingMessageTwo = {
  _id: ObjectId.createFromHexString('6970ef40eb614141dffe78cd'),
  messageId: ObjectId.createFromHexString('6970ef40eb614141dffe78c7'),
  payload: {
    ...createFormattedDocument(alternateMetadata, baseFileUpload4, {
      correlationId: correlationId2,
      publishedAt: null
    }),
    _id: ObjectId.createFromHexString('6970ef40eb614141dffe78c7')
  },
  status: 'PENDING',
  attempts: 1,
  createdAt: '2026-01-21T15:22:45.120Z',
  lastAttemptedAt: '2026-01-21T15:23:02.335Z'
}

const mockPendingMessages = [mockPendingMessageOne, mockPendingMessageTwo]

export { mockPendingMessages, mockPendingMessageOne, mockPendingMessageTwo }
