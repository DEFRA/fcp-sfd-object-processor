import { beforeEach, afterEach, describe, expect, vi, test } from 'vitest'

import { buildDocumentUploadMessageBatch } from '../../../../src/messaging/outbound/crm/doc-upload/build-document-upload-message-batch.js'
import { mockPendingMessages } from '../../../mocks/outbox.js'
import { mockDocumentUploadedEvent } from '../../../mocks/messaging/document-upload-event.js'

describe('buildDocumentUploadMessageBatch', () => {
  let result
  let metadata
  let file

  beforeEach(() => {
    vi.clearAllMocks()
    metadata = mockPendingMessages[0].payload.metadata
    file = mockPendingMessages[0].payload.file
    result = buildDocumentUploadMessageBatch([mockPendingMessages[0]])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('top-level CloudEvents properties', () => {
    test('should set id from fileId', () => {
      expect(result[0].id).toBe(mockPendingMessages[0].payload.file.fileId)
    })

    test('should set source to fcp-sfd-object-processor', () => {
      expect(result[0].source).toBe(mockDocumentUploadedEvent.source)
    })

    test('should set specversion to 1.0', () => {
      expect(result[0].specversion).toBe(mockDocumentUploadedEvent.specversion)
    })

    test('should set type to uk.gov.fcp.sfd.document.uploaded', () => {
      expect(result[0].type).toBe(mockDocumentUploadedEvent.type)
    })

    test('should set datacontenttype to application/json', () => {
      expect(result[0].datacontenttype).toBe(mockDocumentUploadedEvent.datacontenttype)
    })

    test('should set time to current ISO 8601 timestamp', () => {
      expect(result[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(new Date(result[0].time).getTime()).toBeGreaterThan(0)
    })
  })

  describe('data property', () => {
    test('should set data.crn from metadata.crn', () => {
      expect(result[0].data.crn).toBe(metadata.crn)
    })

    test('should set data.sbi from metadata.sbi', () => {
      expect(result[0].data.sbi).toBe(metadata.sbi)
    })

    test('should set data.submissionId from metadata.submissionId', () => {
      expect(result[0].data.submissionId).toBe(metadata.submissionId)
    })

    test('should set data.sourceSystem from metadata.service', () => {
      expect(result[0].data.sourceSystem).toBe(metadata.service)
    })

    test('should set data.correlationId to be a valid UUID', () => {
      expect(result[0].data.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      expect(result[0].data.correlationId).toBe(mockPendingMessages[0].payload.messaging.correlationId)
    })
  })

  describe('data.crm property', () => {
    test('should set data.crm.caseType from metadata.type', () => {
      expect(result[0].data.crm.caseType).toBe(metadata.type)
    })

    test('should set data.crm.title with formatted reference, CRN and date', () => {
      const { reference, crn, submissionDateTime } = metadata
      const [datePart] = submissionDateTime.split(' ')
      const [day, month, year] = datePart.split('/')
      const expectedTitle = `${reference} - CRN ${crn} - ${day}/${month}/${year}`

      expect(result[0].data.crm.title).toBe(expectedTitle)
    })
  })

  describe('data.file property', () => {
    test('should set data.file.fileId from file.fileId', () => {
      expect(result[0].data.file.fileId).toBe(file.fileId)
    })

    test('should set data.file.fileName from file.filename', () => {
      expect(result[0].data.file.fileName).toBe(file.filename)
    })

    test('should set data.file.contentType from file.contentType', () => {
      expect(result[0].data.file.contentType).toBe(file.contentType)
    })
  })

  describe('batch processing', () => {
    test('should transform multiple pending messages', () => {
      const batchResult = buildDocumentUploadMessageBatch(mockPendingMessages)

      expect(batchResult).toHaveLength(2)
      expect(batchResult[0].data.crn).toBe(mockPendingMessages[0].payload.metadata.crn)
      expect(batchResult[1].data.crn).toBe(mockPendingMessages[1].payload.metadata.crn)
    })

    test('should return empty array when given no pending messages', () => {
      const emptyResult = buildDocumentUploadMessageBatch([])

      expect(emptyResult).toHaveLength(0)
    })
  })

  describe('AsyncAPI contract validation', () => {
    test('should have all required top-level properties from AsyncAPI spec', () => {
      const asyncApiKeys = Object.keys(mockDocumentUploadedEvent)
      const resultKeys = Object.keys(result[0])

      expect(resultKeys).toEqual(expect.arrayContaining(asyncApiKeys))
    })

    test('should have matching property types for CloudEvents envelope', () => {
      expect(typeof result[0].id).toBe('string')
      expect(typeof result[0].source).toBe('string')
      expect(typeof result[0].type).toBe('string')
      expect(typeof result[0].specversion).toBe('string')
      expect(typeof result[0].datacontenttype).toBe('string')
      expect(typeof result[0].time).toBe('string')
      expect(typeof result[0].data).toBe('object')
    })

    test('should have all required data properties from AsyncAPI spec', () => {
      const asyncApiDataKeys = Object.keys(mockDocumentUploadedEvent.data)
      const resultDataKeys = Object.keys(result[0].data)

      expect(resultDataKeys).toEqual(expect.arrayContaining(asyncApiDataKeys))
    })

    test('should have matching data property types', () => {
      expect(typeof result[0].data.crn).toBe('string')
      expect(typeof result[0].data.sbi).toBe('string')
      expect(typeof result[0].data.submissionId).toBe('string')
      expect(typeof result[0].data.sourceSystem).toBe('string')
      expect(typeof result[0].data.correlationId).toBe('string')
      expect(typeof result[0].data.crm).toBe('object')
      expect(typeof result[0].data.file).toBe('object')
    })

    test('should have matching data.crm structure', () => {
      const asyncApiCrmKeys = Object.keys(mockDocumentUploadedEvent.data.crm)
      const resultCrmKeys = Object.keys(result[0].data.crm)

      expect(resultCrmKeys).toEqual(expect.arrayContaining(asyncApiCrmKeys))
      expect(typeof result[0].data.crm.caseType).toBe('string')
      expect(typeof result[0].data.crm.title).toBe('string')
    })

    test('should have matching data.file structure', () => {
      const asyncApiFileKeys = Object.keys(mockDocumentUploadedEvent.data.file)
      const resultFileKeys = Object.keys(result[0].data.file)

      expect(resultFileKeys).toEqual(expect.arrayContaining(asyncApiFileKeys))
      expect(typeof result[0].data.file.fileId).toBe('string')
      expect(typeof result[0].data.file.fileName).toBe('string')
      expect(typeof result[0].data.file.contentType).toBe('string')
    })

    test('should not have additional properties beyond AsyncAPI spec', () => {
      const asyncApiDataKeys = Object.keys(mockDocumentUploadedEvent.data)
      const resultDataKeys = Object.keys(result[0].data)

      expect(resultDataKeys.sort()).toEqual(asyncApiDataKeys.sort())
    })
  })
})
