import { ObjectId } from 'mongodb'
import { describe, test, expect, vi, beforeEach } from 'vitest'

import { formatInboundMetadata, persistMetadata, bulkUpdatePublishedAtDate } from '../../../../src/repos/metadata.js'
import { mockScanAndUploadResponse } from '../../../mocks/cdp-uploader.js'
import { db } from '../../../../src/data/db.js'

vi.mock('../../../../src/data/db.js', () => ({
  db: { collection: vi.fn() }
}))

vi.mock('../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'mongo.collections.uploadMetadata') return 'uploadMetadata'
      return null
    })
  }
}))

describe('Metadata Repository', () => {
  let mockCollection
  let mockSession

  beforeEach(() => {
    vi.clearAllMocks()

    mockCollection = {
      insertMany: vi.fn(),
      updateMany: vi.fn()
    }

    mockSession = {}

    db.collection.mockReturnValue(mockCollection)
  })

  describe('Format inbound metadata', () => {
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
          bucket: mockScanAndUploadResponse.form['a-file-upload-field'].s3Bucket
        })

        expect(formattedMetadata[1].s3).toStrictEqual({
          key: mockScanAndUploadResponse.form['another-file-upload-field'].s3Key,
          bucket: mockScanAndUploadResponse.form['another-file-upload-field'].s3Bucket
        })
      })

      test('each object should contain the messaging data in the messaging subdoc', () => {
        expect(formattedMetadata[0].messaging).toStrictEqual({
          publishedAt: null
        })

        expect(formattedMetadata[1].messaging).toStrictEqual({
          publishedAt: null
        })
      })
    })
  })

  describe('persistMetadata', () => {
    const mockDocuments = [
      { metadata: { sbi: '123' }, file: { fileId: 'file-id-1' } }
    ]

    test('should insert documents and return result when acknowledged', async () => {
      const mockResult = {
        acknowledged: true,
        insertedCount: 1,
        insertedIds: { 0: 'id-1' }
      }

      mockCollection.insertMany.mockResolvedValue(mockResult)

      const result = await persistMetadata(mockDocuments, mockSession)

      expect(db.collection).toHaveBeenCalledWith('uploadMetadata')
      expect(mockCollection.insertMany).toHaveBeenCalledWith(mockDocuments, { session: mockSession })
      expect(result).toEqual(mockResult)
    })

    test('should throw error when acknowledged is false', async () => {
      mockCollection.insertMany.mockResolvedValue({ acknowledged: false })

      await expect(persistMetadata(mockDocuments, mockSession))
        .rejects.toThrow('Failed to insert, no acknowledgement from database')
    })
  })

  describe('bulkUpdatePublishedAtDate', () => {
    const mockIds = [new ObjectId(), new ObjectId()]

    test('should update publishedAt and return result when acknowledged', async () => {
      const mockResult = {
        acknowledged: true,
        matchedCount: 2,
        modifiedCount: 2
      }

      mockCollection.updateMany.mockResolvedValue(mockResult)

      const result = await bulkUpdatePublishedAtDate(mockSession, mockIds)

      expect(db.collection).toHaveBeenCalledWith('uploadMetadata')
      expect(mockCollection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: expect.any(Array) }
        }),
        expect.objectContaining({
          $set: {
            messaging: {
              publishedAt: expect.any(Date)
            }
          }
        }),
        { session: mockSession }
      )
      expect(result).toEqual(mockResult)
    })

    test('should throw error when acknowledged is false', async () => {
      mockCollection.updateMany.mockResolvedValue({ acknowledged: false })

      await expect(bulkUpdatePublishedAtDate(mockSession, mockIds))
        .rejects.toThrow('Failed to update publishedAt status')
    })
  })
})
