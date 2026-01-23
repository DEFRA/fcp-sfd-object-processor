import { beforeEach, afterEach, describe, expect, vi, test } from 'vitest'

import { buildDocumentUploadMessageBatch } from '../../../../src/messaging/outbound/crm/doc-upload/build-document-upload-message-batch.js'
import { mockPendingMessages } from '../../../mocks/outbox.js'

describe('buildDocumentUploadMessageBatch', () => {
  let result

  beforeEach(() => {
    vi.clearAllMocks()
    result = buildDocumentUploadMessageBatch([mockPendingMessages[0]])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('top-level CloudEvents properties', () => {
    test('should set id from messageId', () => {
      expect(result[0].id).toBe(mockPendingMessages[0].messageId)
    })

    test('should set source to fcp-sfd-object-processor', () => {
      expect(result[0].source).toBe('fcp-sfd-object-processor')
    })

    test('should set specversion to 1.0', () => {
      expect(result[0].specversion).toBe('1.0')
    })

    test('should set type to uk.gov.fcp.sfd.event', () => {
      expect(result[0].type).toBe('uk.gov.fcp.sfd.event')
    })

    test('should set subject to document.uploaded', () => {
      expect(result[0].subject).toBe('document.uploaded')
    })

    test('should set datacontenttype to application/json', () => {
      expect(result[0].datacontenttype).toBe('application/json')
    })

    test('should set time to current ISO 8601 timestamp', () => {
      expect(result[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(new Date(result[0].time).getTime()).toBeGreaterThan(0)
    })
  })

  describe('data property', () => {
    test('should set data.crn from metadata.crn', () => {
      expect(result[0].data.crn).toBe('1050000000')
    })

    test('should set data.sbi from metadata.sbi', () => {
      expect(result[0].data.sbi).toBe('105000000')
    })

    test('should set data.submissionId from metadata.submissionId', () => {
      expect(result[0].data.submissionId).toBe('1733826312')
    })

    test('should set data.sourceSystem from metadata.service', () => {
      expect(result[0].data.sourceSystem).toBe('SFD')
    })

    test('should set data.correlationId to placeholder', () => {
      expect(result[0].data.correlationId).toBe('placeholder-correlation-id')
    })
  })

  describe('data.crm property', () => {
    test('should set data.crm.caseType from metadata.type', () => {
      expect(result[0].data.crm.caseType).toBe('CS_Agreement_Evidence')
    })

    test('should set data.crm.title with formatted reference, CRN and date', () => {
      expect(result[0].data.crm.title).toBe('user entered reference - CRN 1050000000 - 31/12/2024')
    })
  })

  describe('data.file property', () => {
    test('should set data.file.fileId from file.fileId', () => {
      expect(result[0].data.file.fileId).toBe('693db079-f82b-4bbc-87e9-86d822cc0bad')
    })

    test('should set data.file.fileName from file.filename', () => {
      expect(result[0].data.file.fileName).toBe('upload-example-5.png')
    })

    test('should set data.file.contentType from file.contentType', () => {
      expect(result[0].data.file.contentType).toBe('image/png')
    })

    test('should set data.file.url with fileId in path', () => {
      expect(result[0].data.file.url).toBe('https://example.com/files/693db079-f82b-4bbc-87e9-86d822cc0bad')
    })
  })

  describe('batch processing', () => {
    test('should transform multiple pending messages', () => {
      const batchResult = buildDocumentUploadMessageBatch(mockPendingMessages)

      expect(batchResult).toHaveLength(2)
      expect(batchResult[0].data.crn).toBe('1050000000')
      expect(batchResult[1].data.crn).toBe('2050000000')
    })

    test('should return empty array when given no pending messages', () => {
      const emptyResult = buildDocumentUploadMessageBatch([])

      expect(emptyResult).toHaveLength(0)
    })
  })
})
