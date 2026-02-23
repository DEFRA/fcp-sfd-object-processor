/**
 * Document Mock Data
 *
 * Represents the internal document storage format after processing CDP Uploader callbacks.
 * These are formatted documents with metadata, file, raw, s3, and messaging subdocuments.
 *
 * This is the INTERNAL STORAGE format in our MongoDB collections.
 */
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
const defaultCorrelationId = '123e4567-e89b-12d3-a456-426655440000'

// Simplified metadata response (metadata + file only) - used by metadata endpoint tests
// This is what's typically returned by the /api/v1/metadata/sbi/{sbi} endpoint
export const mockMetadataResponse = [
  {
    metadata: baseMetadata,
    file: createFileSubdocument(baseFileUpload1)
  },
  {
    metadata: baseMetadata,
    file: createFileSubdocument(baseFileUpload2)
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
    file: createFileSubdocument(baseFileUpload3)
  },
  {
    metadata: alternateMetadata,
    file: createFileSubdocument(baseFileUpload4)
  }
]

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
