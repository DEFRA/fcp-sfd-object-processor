import { describe, test, expect } from 'vitest'

import { formatInboundMetadata } from '../../../../src/repos/metadata.js'
import { mockScanAndUploadResponse } from '../../../mocks/cdp-uploader.js'

describe('Format metadata payload from raw CDP response', () => {
  describe('When payload includes multiple uploads', () => {
    const formattedMetadata = formatInboundMetadata(mockScanAndUploadResponse)

    test('it should return an array', () => {
      expect(formattedMetadata).toBeInstanceOf(Array)
    })

    test('it should return an array of the same length as the number of file uploads from the payloads form', () => {
      // remove any keys that don't have a 'fileId' as its not an upload then.
      const validKeys = Object.values(mockScanAndUploadResponse.form).filter(key => key.fileId)
      expect(formattedMetadata.length).toBe(validKeys.length)
    })

    test('each object should contain the raw form data with the uploadStatus and numberOfRejectedFiles', () => {
      expect(formattedMetadata[0].raw).toStrictEqual({
        uploadStatus: mockScanAndUploadResponse.uploadStatus,
        numberOfRejectedFiles: mockScanAndUploadResponse.numberOfRejectedFiles,
        ...mockScanAndUploadResponse.form['a-file-upload-field']
      })

      expect(formattedMetadata[1].raw).toStrictEqual({
        uploadStatus: mockScanAndUploadResponse.uploadStatus,
        numberOfRejectedFiles: mockScanAndUploadResponse.numberOfRejectedFiles,
        ...mockScanAndUploadResponse.form['another-file-upload-field']
      })
    })

    test('each object should contain the same metadata', () => {
      expect(formattedMetadata[0].metadata).toBe(mockScanAndUploadResponse.metadata)
      expect(formattedMetadata[1].metadata).toBe(mockScanAndUploadResponse.metadata)
    })

    test('each object should contain the filedata in the file subdocument', () => {
      expect(formattedMetadata[0].file).toStrictEqual({
        fileId: mockScanAndUploadResponse.form['a-file-upload-field'].fileId,
        filename: mockScanAndUploadResponse.form['a-file-upload-field'].filename,
        contentType: mockScanAndUploadResponse.form['a-file-upload-field'].contentType,
        fileStatus: mockScanAndUploadResponse.form['a-file-upload-field'].fileStatus
      })

      expect(formattedMetadata[1].file).toStrictEqual({
        fileId: mockScanAndUploadResponse.form['another-file-upload-field'].fileId,
        filename: mockScanAndUploadResponse.form['another-file-upload-field'].filename,
        contentType: mockScanAndUploadResponse.form['another-file-upload-field'].contentType,
        fileStatus: mockScanAndUploadResponse.form['another-file-upload-field'].fileStatus
      })
    })

    test('each object should contain the s3 data in the s3 subdoc', () => {
      expect(formattedMetadata[0].s3).toStrictEqual({
        key: mockScanAndUploadResponse.form['a-file-upload-field'].s3Key,
        bucket: mockScanAndUploadResponse.form['a-file-upload-field'].s3Bucket,
      })

      expect(formattedMetadata[1].s3).toStrictEqual({
        key: mockScanAndUploadResponse.form['another-file-upload-field'].s3Key,
        bucket: mockScanAndUploadResponse.form['another-file-upload-field'].s3Bucket,
      })
    })
  })
})
