/**
 * Document Mock Data
 *
 * Represents the internal document storage format after processing CDP Uploader callbacks.
 * These are formatted documents with metadata, file, raw, s3, and messaging subdocuments.
 *
 * This is the INTERNAL STORAGE format in our MongoDB collections.
 */
import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'
import {
  baseMetadata,
  baseFileUpload1,
  baseFileUpload2,
  alternateMetadata,
  baseFileUpload3,
  baseFileUpload4,
  createFileSubdocument,
  createFormattedDocument
} from './base-data.js'

// Shared correlation ID for documents in the same submission
const defaultCorrelationId = '2a0d9cfe-6a34-4b34-98fb-9b79c73f4d11'

// Simplified metadata response (metadata + file only) - used by metadata endpoint tests
// This is what's typically returned by the /api/v1/metadata/sbi/{sbi} endpoint
export const mockMetadataResponse = [
  {
    metadata: baseMetadata,
    file: createFileSubdocument(baseFileUpload1),
    messaging: { correlationId: defaultCorrelationId }
  },
  {
    metadata: baseMetadata,
    file: createFileSubdocument(baseFileUpload2),
    messaging: { correlationId: defaultCorrelationId }
  }
]

// Full formatted documents with all subdocuments (raw, s3, messaging)
// This is the complete document structure stored in MongoDB after callback processing
export const mockFormattedDocuments = [
  createFormattedDocument(baseMetadata, baseFileUpload1, { correlationId: defaultCorrelationId }),
  createFormattedDocument(baseMetadata, baseFileUpload2, { correlationId: defaultCorrelationId })
]

// Alternative metadata response for different submission
export const mockMetadataResponseAlt = [
  {
    metadata: alternateMetadata,
    file: createFileSubdocument(baseFileUpload3),
    messaging: { correlationId: defaultCorrelationId }
  },
  {
    metadata: alternateMetadata,
    file: createFileSubdocument(baseFileUpload4),
    messaging: { correlationId: defaultCorrelationId }
  }
]

const OBJECT_ID_TIMESTAMP_HEX_LENGTH = 8
const OBJECT_ID_SUFFIX_HEX_LENGTH = 16
const HEX_RADIX = 16
const MILLISECONDS_PER_SECOND = 1000

/**
 * Builds many formatted documents for baseMetadata's SBI, each with a distinct
 * random UUIDv4 file.fileId.
 *
 * Each _id is set explicitly: the current time in seconds followed by the
 * document's position, so the _id values are strictly increasing in array
 * order. Driver generated ObjectIds are only increasing until their counter
 * wraps, which would make newest first assertions intermittently fail.
 *
 * @param {number} count number of documents to build
 * @returns {Array<object>} documents in ascending _id order, oldest first
 */
export const createManyMetadataDocuments = (count) => {
  const timestampHex = Math.floor(Date.now() / MILLISECONDS_PER_SECOND)
    .toString(HEX_RADIX)
    .padStart(OBJECT_ID_TIMESTAMP_HEX_LENGTH, '0')

  return Array.from({ length: count }, (_, position) => ({
    _id: ObjectId.createFromHexString(
      `${timestampHex}${position.toString(HEX_RADIX).padStart(OBJECT_ID_SUFFIX_HEX_LENGTH, '0')}`
    ),
    ...createFormattedDocument(
      baseMetadata,
      { ...baseFileUpload1, fileId: randomUUID() },
      { correlationId: defaultCorrelationId }
    )
  }))
}

// Single formatted document with all subdocuments (used for blob endpoint tests)
export const mockFormattedMetadata = createFormattedDocument(
  baseMetadata,
  baseFileUpload1,
  { correlationId: defaultCorrelationId }
)

// Legacy exports - kept for backward compatibility
// @deprecated Use createFormattedDocument() helper or mockMetadataResponse instead
export const mockRawData = {
  raw: {
    uploadStatus: 'ready',
    numberOfRejectedFiles: 0,
    ...baseFileUpload1
  }
}

export const mockS3Data = {
  s3: {
    key: baseFileUpload1.s3Key,
    bucket: baseFileUpload1.s3Bucket
  }
}
