import { randomUUID } from 'node:crypto'

/**
 * Base mock data - Core building blocks for test data
 * These are the atomic pieces used across all mock files
 */

// Core metadata structure shared across all uploads in a submission
export const baseMetadata = {
  sbi: 105000000,
  crn: 1050000000,
  frn: 1102658375,
  submissionId: '1733826312',
  uosr: '107220150_1733826312',
  submissionDateTime: '10/12/2024 10:25:12',
  files: ['107220150_1733826312_SBI107220150.pdf'],
  filesInSubmission: 2,
  type: 'CS_Agreement_Evidence',
  reference: 'user entered reference',
  service: 'fcp-sfd-frontend'
}

// Alternative metadata for testing different submission scenarios
export const alternateMetadata = {
  sbi: 205000000,
  crn: 2050000000,
  frn: 2102658375,
  submissionId: '1733826314',
  uosr: '107220150_1733826312',
  submissionDateTime: '10/12/2024 10:25:12',
  files: ['107220150_1733826312_SBI107220150.pdf'],
  filesInSubmission: 2,
  type: 'CS_Agreement_Evidence',
  reference: 'user entered reference',
  service: 'fcp-sfd-frontend'
}

// First file upload object (JPEG image)
export const baseFileUpload1 = {
  fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
  filename: 'dragon-b.jpeg',
  contentType: 'image/jpeg',
  fileStatus: 'complete',
  contentLength: 11264,
  checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
  detectedContentType: 'image/jpeg',
  s3Key: '3b0b2a02-a669-44ba-9b78-bd5cb8460253/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
  s3Bucket: 'cdp-example-node-frontend'
}

// Second file upload object (PDF document)
export const baseFileUpload2 = {
  fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554',
  filename: 'Health and Safety Assessment Certificate.pdf',
  contentType: 'application/pdf',
  fileStatus: 'complete',
  contentLength: 115307,
  checksumSha256: 'ZbILFUsbS2Pio0Sv2ifwyg+SSQsnzVF1h6fQzAiBt4Q=',
  detectedContentType: 'application/pdf',
  s3Key: 'scanned/8ea63b47-f5ac-410e-8b1c-3ae522b0a96c/3f90b889-eac7-4e98-975f-93fcef5b8554',
  s3Bucket: 'fcp-sfd-object-processor-bucket'
}

// Third file upload for additional test scenarios
export const baseFileUpload3 = {
  fileId: '693db079-f82b-4bbc-87e9-86d822cc0bad',
  filename: 'upload-example-5.png',
  contentType: 'image/png',
  fileStatus: 'complete',
  contentLength: 338195,
  checksumSha256: 'WzfoGsFx/lsHpqGG8KGErp+w7+T5MvkDKt5dZlcOqAc=',
  detectedContentType: 'image/png',
  s3Key: 'scanned/85a50fa1-3d1d-46b7-a9eb-b72fc9d97031/693db079-f82b-4bbc-87e9-86d822cc0bad',
  s3Bucket: 'dev-fcp-sfd-object-processor-bucket-c63f2'
}

// Fourth file upload for multi-file scenarios
export const baseFileUpload4 = {
  fileId: '8a4fc18e-2c3d-4e5f-b7a2-9d3e6f8c1b4a',
  filename: 'agreement-document.pdf',
  contentType: 'application/pdf',
  fileStatus: 'complete',
  contentLength: 524288,
  checksumSha256: 'XyBpHtGkY/mnRpFH9LHFqr+x8+U6NwlELu6eAmdPrBd=',
  detectedContentType: 'application/pdf',
  s3Key: 'scanned/85a50fa1-3d1d-46b7-a9eb-b72fc9d97031/8a4fc18e-2c3d-4e5f-b7a2-9d3e6f8c1b4a',
  s3Bucket: 'dev-fcp-sfd-object-processor-bucket-c63f2'
}

/**
 * Helper functions to create formatted data structures
 */

// Create a file subdocument (subset of upload data stored in documents)
export const createFileSubdocument = (fileUpload) => ({
  fileId: fileUpload.fileId,
  filename: fileUpload.filename,
  contentType: fileUpload.contentType,
  fileStatus: fileUpload.fileStatus
})

// Create S3 subdocument from file upload
export const createS3Subdocument = (fileUpload) => ({
  key: fileUpload.s3Key,
  bucket: fileUpload.s3Bucket
})

// Create raw subdocument (combines upload status with file details)
export const createRawSubdocument = (fileUpload, uploadStatus = 'ready', numberOfRejectedFiles = 0) => ({
  uploadStatus,
  numberOfRejectedFiles,
  ...fileUpload
})

// Create messaging envelope for documents
export const createMessagingEnvelope = (correlationId = randomUUID(), publishedAt = null) => ({
  correlationId,
  publishedAt
})

// Create a complete formatted document (internal storage format)
export const createFormattedDocument = (metadata, fileUpload, options = {}) => {
  const {
    uploadStatus = 'ready',
    numberOfRejectedFiles = 0,
    correlationId = randomUUID(),
    publishedAt = null
  } = options

  return {
    metadata,
    file: createFileSubdocument(fileUpload),
    raw: createRawSubdocument(fileUpload, uploadStatus, numberOfRejectedFiles),
    s3: createS3Subdocument(fileUpload),
    messaging: createMessagingEnvelope(correlationId, publishedAt)
  }
}
