import { beforeEach, describe, expect, vi, test } from 'vitest'
import { ObjectId } from 'mongodb'
import {
  persistMetadataWithOutbox,
  persistValidationFailureStatus
} from '../../../src/services/metadata-service.js'
import {
  mapValidationErrors,
  buildValidationFailureStatusDocuments,
  buildValidatedStatusDocuments
} from '../../../src/mappers/status.js'
import { persistMetadata, formatInboundMetadata } from '../../../src/repos/metadata.js'
import { createOutboxEntries } from '../../../src/repos/outbox.js'
import { insertStatus } from '../../../src/repos/status.js'
import { client } from '../../../src/data/db.js'
import { mockScanAndUploadResponseArray as rawDocuments } from '../../mocks/cdp-uploader.js'
import { mockFormattedDocuments as formattedDocuments } from '../../mocks/metadata.js'

vi.mock('../../../src/repos/metadata.js')
vi.mock('../../../src/repos/outbox.js')
vi.mock('../../../src/repos/status.js')
vi.mock('../../../src/data/db.js', () => ({
  db: { collection: vi.fn() },
  client: {
    startSession: vi.fn()
  }
}))

vi.mock('../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

describe('Metadata Service', () => {
  let mockSession

  beforeEach(() => {
    vi.clearAllMocks()

    mockSession = {
      withTransaction: vi.fn(),
      endSession: vi.fn()
    }

    client.startSession.mockReturnValue(mockSession)
  })

  describe('persistMetadataWithOutbox', () => {
    test('should start and end a session', async () => {
      formatInboundMetadata.mockReturnValue(formattedDocuments)
      insertStatus.mockResolvedValue({ acknowledged: true, insertedIds: {} })
      persistMetadata.mockResolvedValue({ insertedIds: {} })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(client.startSession).toHaveBeenCalled()
      expect(mockSession.endSession).toHaveBeenCalled()
    })

    test('should use the transaction when persisting', async () => {
      formatInboundMetadata.mockReturnValue(formattedDocuments)
      insertStatus.mockResolvedValue({ acknowledged: true, insertedIds: {} })
      persistMetadata.mockResolvedValue({ insertedIds: {} })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(mockSession.withTransaction).toHaveBeenCalled()
    })

    test('should format inbound metadata before persisting', async () => {
      formatInboundMetadata.mockReturnValue(formattedDocuments)
      insertStatus.mockResolvedValue({ acknowledged: true, insertedIds: {} })
      persistMetadata.mockResolvedValue({ insertedIds: {} })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(formatInboundMetadata).toHaveBeenCalledWith(rawDocuments)
    })

    test('should call persistMetadata with formatted documents and session', async () => {
      formatInboundMetadata.mockReturnValue(formattedDocuments)
      insertStatus.mockResolvedValue({ acknowledged: true, insertedIds: {} })
      persistMetadata.mockResolvedValue({ insertedIds: {} })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(persistMetadata).toHaveBeenCalledWith(formattedDocuments, mockSession)
    })

    test('should create outbox entries with inserted IDs and formatted documents', async () => {
      const mockMetadataResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: ObjectId.createFromHexString('507f1f77bcf86cd799439011'), 1: ObjectId.createFromHexString('507f1f77bcf86cd799439012') }
      }

      formatInboundMetadata.mockReturnValue(formattedDocuments)
      insertStatus.mockResolvedValue({ acknowledged: true, insertedIds: {} })
      persistMetadata.mockResolvedValue(mockMetadataResult)
      createOutboxEntries.mockResolvedValue({ 0: new ObjectId(), 1: new ObjectId() })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(createOutboxEntries).toHaveBeenCalledWith(
        mockMetadataResult.insertedIds,
        formattedDocuments,
        mockSession
      )
    })

    test('should return the metadata result', async () => {
      const mockMetadataResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: ObjectId.createFromHexString('507f1f77bcf86cd799439011'), 1: ObjectId.createFromHexString('507f1f77bcf86cd799439012') }
      }

      formatInboundMetadata.mockReturnValue(formattedDocuments)
      insertStatus.mockResolvedValue({ acknowledged: true, insertedIds: {} })
      persistMetadata.mockResolvedValue(mockMetadataResult)
      createOutboxEntries.mockResolvedValue({ 0: new ObjectId(), 1: new ObjectId() })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      const result = await persistMetadataWithOutbox(rawDocuments)

      expect(result).toEqual(mockMetadataResult)
    })

    test('should throw error and end session if metadata persist fails', async () => {
      const mockError = new Error('Database error')

      persistMetadata.mockRejectedValue(mockError)
      insertStatus.mockResolvedValue({ acknowledged: true, insertedIds: {} })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await expect(persistMetadataWithOutbox(rawDocuments)).rejects.toThrow('Database error')

      expect(mockSession.endSession).toHaveBeenCalled()
    })

    test('should throw error and end session if outbox creation fails', async () => {
      const mockMetadataResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: ObjectId.createFromHexString('507f1f77bcf86cd799439011'), 1: ObjectId.createFromHexString('507f1f77bcf86cd799439012') }
      }

      const mockError = new Error('Outbox creation failed')

      persistMetadata.mockResolvedValue(mockMetadataResult)
      insertStatus.mockResolvedValue({ acknowledged: true, insertedIds: {} })
      createOutboxEntries.mockRejectedValue(mockError)

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await expect(persistMetadataWithOutbox(rawDocuments)).rejects.toThrow('Outbox creation failed')

      expect(mockSession.endSession).toHaveBeenCalled()
    })

    test('should end session even if transaction throws error', async () => {
      const mockError = new Error('Transaction error')

      mockSession.withTransaction.mockRejectedValue(mockError)

      await expect(persistMetadataWithOutbox(rawDocuments)).rejects.toThrow('Transaction error')

      expect(mockSession.endSession).toHaveBeenCalled()
    })

    test('should insert validated status records before metadata and outbox', async () => {
      const mockMetadataResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: ObjectId.createFromHexString('507f1f77bcf86cd799439011'), 1: ObjectId.createFromHexString('507f1f77bcf86cd799439012') }
      }

      formatInboundMetadata.mockReturnValue(formattedDocuments)
      insertStatus.mockResolvedValue({ acknowledged: true, insertedIds: {} })
      persistMetadata.mockResolvedValue(mockMetadataResult)
      createOutboxEntries.mockResolvedValue({ 0: new ObjectId(), 1: new ObjectId() })

      mockSession.withTransaction.mockImplementation(async (callback) => {
        return await callback()
      })

      await persistMetadataWithOutbox(rawDocuments)

      expect(insertStatus).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ validated: true, errors: null }),
          expect.objectContaining({ validated: true, errors: null })
        ]),
        mockSession
      )
    })
  })

  describe('persistValidationFailureStatus', () => {
    test('should persist failed validation status records', async () => {
      const validationError = {
        details: [
          {
            path: ['metadata', 'crn'],
            type: 'any.required',
            context: { value: undefined }
          }
        ]
      }

      insertStatus.mockResolvedValue({ acknowledged: true, insertedCount: 2 })

      await persistValidationFailureStatus(rawDocuments[0], validationError)

      expect(insertStatus).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ validated: false, correlationId: expect.any(String) }),
          expect.objectContaining({ validated: false, correlationId: expect.any(String) })
        ])
      )
      expect(client.startSession).not.toHaveBeenCalled()
    })

    test('should generate a correlationId and pass it to the status mapper', async () => {
      const validationError = {
        details: [
          {
            path: ['metadata', 'crn'],
            type: 'any.required',
            context: { value: undefined }
          }
        ]
      }

      insertStatus.mockResolvedValue({ acknowledged: true, insertedCount: 2 })

      await persistValidationFailureStatus(rawDocuments[0], validationError)

      const statusDocuments = insertStatus.mock.calls[0][0]

      // All documents in the batch should share the same correlationId
      const correlationIds = statusDocuments.map(doc => doc.correlationId)
      const uniqueCorrelationIds = [...new Set(correlationIds)]

      expect(uniqueCorrelationIds).toHaveLength(1)
      expect(uniqueCorrelationIds[0]).toBeDefined()
      expect(typeof uniqueCorrelationIds[0]).toBe('string')
      expect(uniqueCorrelationIds[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    })
  })

  describe('validation error mapping helpers', () => {
    test('should map Joi error types to expected status error types', () => {
      const mapped = mapValidationErrors({
        details: [
          { path: ['metadata', 'crn'], type: 'any.required', context: { value: undefined } },
          { path: ['form', 'file', 'fileId'], type: 'string.guid', context: { value: 'not-a-uuid' } },
          { path: ['metadata', 'service'], type: 'any.only', context: { value: 'invalid' } },
          { path: ['metadata', 'sbi'], type: 'number.min', context: { value: 1 } }
        ]
      })

      expect(mapped).toEqual([
        { field: 'metadata.crn', errorType: 'any.required', receivedValue: '' },
        { field: 'form.file.fileId', errorType: 'string.guid', receivedValue: 'not-a-uuid' },
        { field: 'metadata.service', errorType: 'any.only', receivedValue: 'invalid' },
        { field: 'metadata.sbi', errorType: 'number.min', receivedValue: '1' }
      ])
    })

    test('should build validated status documents', () => {
      const documents = buildValidatedStatusDocuments(formattedDocuments)

      expect(documents).toHaveLength(2)
      expect(documents[0]).toMatchObject({
        sbi: formattedDocuments[0].metadata.sbi,
        fileId: formattedDocuments[0].file.fileId,
        validated: true,
        errors: null
      })
      expect(documents[0].timestamp).toBeInstanceOf(Date)
    })

    test('should build validation failure status documents with mapped errors', () => {
      const payload = {
        metadata: { sbi: 105000000 },
        form: {
          a: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' },
          b: { fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554' }
        }
      }

      const validationError = {
        details: [
          { path: ['metadata', 'crn'], type: 'any.required', context: { value: undefined } }
        ]
      }

      const correlationId = '550e8400-e29b-41d4-a716-446655440000'
      const documents = buildValidationFailureStatusDocuments(payload, validationError, correlationId)

      expect(documents).toHaveLength(2)
      expect(documents[0]).toMatchObject({
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        sbi: 105000000,
        fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        validated: false,
        errors: [{ field: 'metadata.crn', errorType: 'any.required', receivedValue: '' }]
      })
      expect(documents[0].timestamp).toBeInstanceOf(Date)
    })
  })
})
