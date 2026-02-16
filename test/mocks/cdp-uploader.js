/**
 * CDP Uploader Mock Data
 *
 * Represents the callback payload structure received from CDP Uploader service
 * after file scanning and upload to S3 completes.
 *
 * This is the INPUT format to our service.
 */
import { baseMetadata, baseFileUpload1, baseFileUpload2, alternateMetadata } from './base-data.js'

// Mock of the full response from the CDP Uploader scanAndUpload endpoint
// NOTE: The form object can contain both file upload objects and plain text fields
export const mockScanAndUploadResponse = {
  uploadStatus: 'ready',
  metadata: baseMetadata,
  form: {
    'a-file-upload-field': baseFileUpload1,
    'another-file-upload-field': baseFileUpload2,
    'a-form-field': 'not a file upload some other value', // example of non-file form field
    'another-form-field': 'another value that is not a file upload'
  },
  numberOfRejectedFiles: 0
}

// Alternative callback response for testing different scenarios
export const mockScanAndUploadResponseAlt = {
  uploadStatus: 'ready',
  metadata: alternateMetadata,
  form: {
    'file-upload': baseFileUpload1
  },
  numberOfRejectedFiles: 0
}

// Callback with only one file upload
export const mockScanAndUploadResponseSingleFile = {
  uploadStatus: 'ready',
  metadata: baseMetadata,
  form: {
    'single-file': baseFileUpload1,
    'text-field': 'some text value'
  },
  numberOfRejectedFiles: 0
}

// Legacy export - kept for backward compatibility but deprecated
// @deprecated Use mockScanAndUploadResponse or create specific test data instead
export const mockScanAndUploadResponseArray = [
  mockScanAndUploadResponse,
  mockScanAndUploadResponseAlt
]
