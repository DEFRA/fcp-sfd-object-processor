import { describe, test, expect, vi, beforeEach } from 'vitest'

import {
  formatInboundMetadata,
  persistMetadata,
  bulkUpdatePublishedAtDate,
  getS3ReferenceByFileId,
  getMetadataByFileId,
  getMetadataBySbi
} from '../../../../src/repos/metadata.js'
import { mockScanAndUploadResponse } from '../../../mocks/cdp-uploader.js'
import { db } from '../../../../src/data/db.js'
import { NotFoundError } from '../../../../src/errors/not-found-error.js'

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

let mockCollection
let mockSession

describe('Metadata Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockCollection = {
      insertMany: vi.fn(),
      updateMany: vi.fn(),
      findOne: vi.fn(),
      find: vi.fn()
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

      test('each object should have messaging.publishedAt set to null', () => {
        expect(formattedMetadata[0].messaging.publishedAt).toBeNull()
        expect(formattedMetadata[1].messaging.publishedAt).toBeNull()
      })

      test('each object should have the same correlationId', () => {
        expect(formattedMetadata[0].messaging.correlationId).toBe(formattedMetadata[1].messaging.correlationId)
      })
    })

    test('filters out non-file form entries', () => {
      const payload = {
        ...mockScanAndUploadResponse,
        form: {
          'a-file-upload-field': mockScanAndUploadResponse.form['a-file-upload-field'],
          'text-field': 'not a file',
          'empty-object': {},
          'null-field': null
        }
      }

      const formatted = formatInboundMetadata(payload)

      expect(formatted).toHaveLength(1)
      expect(formatted[0].file.fileId).toBe(mockScanAndUploadResponse.form['a-file-upload-field'].fileId)
    })

    test('flattens and extracts file uploads from arrays', () => {
      const fileUpload1 = mockScanAndUploadResponse.form['a-file-upload-field']
      const fileUpload2 = mockScanAndUploadResponse.form['another-file-upload-field']

      const payload = {
        ...mockScanAndUploadResponse,
        form: {
          documents: [fileUpload1, fileUpload2]
        }
      }

      const formatted = formatInboundMetadata(payload)

      expect(formatted).toHaveLength(2)
      expect(formatted[0].file.fileId).toBe(fileUpload1.fileId)
      expect(formatted[1].file.fileId).toBe(fileUpload2.fileId)
    })

    test('preserves correlationId across grouped file uploads in arrays', () => {
      const fileUpload1 = mockScanAndUploadResponse.form['a-file-upload-field']
      const fileUpload2 = mockScanAndUploadResponse.form['another-file-upload-field']

      const payload = {
        ...mockScanAndUploadResponse,
        form: {
          documents: [fileUpload1, fileUpload2]
        }
      }

      const formatted = formatInboundMetadata(payload)

      expect(formatted[0].messaging.correlationId).toBe(formatted[1].messaging.correlationId)
    })

    test('flattens arrays and filters non-file entries', () => {
      const fileUpload1 = mockScanAndUploadResponse.form['a-file-upload-field']
      const fileUpload2 = mockScanAndUploadResponse.form['another-file-upload-field']

      const payload = {
        ...mockScanAndUploadResponse,
        form: {
          'single-file': fileUpload1,
          documents: [
            'string value',
            fileUpload2,
            42,
            null
          ],
          'text-field': 'not a file'
        }
      }

      const formatted = formatInboundMetadata(payload)

      expect(formatted).toHaveLength(2)
      expect(formatted[0].file.fileId).toBe(fileUpload1.fileId)
      expect(formatted[1].file.fileId).toBe(fileUpload2.fileId)
      expect(formatted[0].messaging.correlationId).toBe(formatted[1].messaging.correlationId)
    })

    test('handles mixed single files and grouped arrays with same correlationId', () => {
      const fileUpload1 = mockScanAndUploadResponse.form['a-file-upload-field']
      const fileUpload2 = mockScanAndUploadResponse.form['another-file-upload-field']

      const payload = {
        ...mockScanAndUploadResponse,
        form: {
          single: fileUpload1,
          documents: [fileUpload2]
        }
      }

      const formatted = formatInboundMetadata(payload)

      expect(formatted).toHaveLength(2)
      // All files should share the same correlationId
      expect(formatted[0].messaging.correlationId).toBe(formatted[1].messaging.correlationId)
    })
  })
})

describe('getS3ReferenceByFileId', () => {
  let queryCollection

  beforeEach(() => {
    vi.clearAllMocks()
    queryCollection = { findOne: vi.fn() }
    db.collection.mockReturnValue(queryCollection)
  })

  test('returns s3 projection when document exists', async () => {
    const document = { s3: { key: 'k', bucket: 'b' } }
    queryCollection.findOne.mockResolvedValue(document)

    const result = await getS3ReferenceByFileId('file-1')

    expect(result).toEqual(document)
    expect(queryCollection.findOne).toHaveBeenCalledWith(
      { 'file.fileId': 'file-1' },
      { projection: { s3: 1 } }
    )
  })

  test('throws NotFoundError when document is missing', async () => {
    queryCollection.findOne.mockResolvedValue(null)

    await expect(getS3ReferenceByFileId('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('getMetadataByFileId', () => {
  let queryCollection

  beforeEach(() => {
    vi.clearAllMocks()
    queryCollection = { findOne: vi.fn() }
    db.collection.mockReturnValue(queryCollection)
  })

  test('returns messaging projection when document exists', async () => {
    const document = { messaging: { correlationId: 'corr-1' } }
    queryCollection.findOne.mockResolvedValue(document)

    const result = await getMetadataByFileId('file-1')

    expect(result).toEqual(document)
    expect(queryCollection.findOne).toHaveBeenCalledWith(
      { 'file.fileId': 'file-1' },
      { projection: { messaging: 1 } }
    )
  })

  test('throws NotFoundError when document is missing', async () => {
    queryCollection.findOne.mockResolvedValue(null)

    await expect(getMetadataByFileId('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('getMetadataBySbi', () => {
  let queryCollection

  beforeEach(() => {
    vi.clearAllMocks()
    queryCollection = { find: vi.fn() }
    db.collection.mockReturnValue(queryCollection)
  })

  test('returns documents when sbi matches', async () => {
    const documents = [{ metadata: { sbi: '123' }, file: { fileId: 'f1' } }]
    const toArray = vi.fn().mockResolvedValue(documents)
    const project = vi.fn().mockReturnValue({ toArray })
    queryCollection.find.mockReturnValue({ project })

    const result = await getMetadataBySbi('123')

    expect(result).toEqual(documents)
    expect(queryCollection.find).toHaveBeenCalledWith({ 'metadata.sbi': '123' })
  })

  test('throws NotFoundError when no documents match', async () => {
    const toArray = vi.fn().mockResolvedValue([])
    const project = vi.fn().mockReturnValue({ toArray })
    queryCollection.find.mockReturnValue({ project })

    await expect(getMetadataBySbi('missing')).rejects.toThrow(NotFoundError)
  })
})

describe('persistMetadata', () => {
  const mockDocuments = [
    { metadata: { sbi: '123' }, file: { fileId: 'file-id-1' } }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockCollection = {
      insertMany: vi.fn(),
      updateMany: vi.fn()
    }
    db.collection.mockReturnValue(mockCollection)
  })

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
  const mockIds = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']

  beforeEach(() => {
    vi.clearAllMocks()
    mockCollection = {
      insertMany: vi.fn(),
      updateMany: vi.fn()
    }
    db.collection.mockReturnValue(mockCollection)
  })

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
        'file.fileId': { $in: expect.any(Array) }
      }),
      expect.objectContaining({
        $set: {
          'messaging.publishedAt': expect.any(Date)
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
