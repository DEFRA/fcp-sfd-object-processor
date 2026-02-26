import { describe, expect, test, beforeEach, vi } from 'vitest'
import {
  mapValidationErrors,
  buildValidatedStatusDocuments,
  buildValidationFailureStatusDocuments
} from '../../../src/mappers/status.js'
import {
  mockRequiredFieldError,
  mockMultipleErrors,
  mockPayloadWithFiles,
  mockPayloadNoFiles,
  mockValidatedDocuments
} from '../../mocks/validation-errors.js'

describe('Status Mappers', () => {
  describe('mapValidationErrors', () => {
    test('should return empty array when validationError is undefined', () => {
      const result = mapValidationErrors(undefined)
      expect(result).toEqual([])
    })

    test('should return empty array when validationError is null', () => {
      const result = mapValidationErrors(null)
      expect(result).toEqual([])
    })

    test('should return empty array when validationError has no details', () => {
      const result = mapValidationErrors({})
      expect(result).toEqual([])
    })

    test('should return empty array when details is not an array', () => {
      const result = mapValidationErrors({ details: 'not-an-array' })
      expect(result).toEqual([])
    })

    test('should return empty array when details is an empty array', () => {
      const result = mapValidationErrors({ details: [] })
      expect(result).toEqual([])
    })

    test('should map single validation error correctly', () => {
      const result = mapValidationErrors(mockRequiredFieldError)

      expect(result).toEqual([
        {
          field: 'metadata.crn',
          errorType: 'any.required',
          receivedValue: null
        }
      ])
    })

    test('should map multiple validation errors correctly', () => {
      const result = mapValidationErrors(mockMultipleErrors)

      expect(result).toEqual([
        { field: 'metadata.crn', errorType: 'any.required', receivedValue: null },
        { field: 'metadata.sbi', errorType: 'number.min', receivedValue: 123 },
        { field: 'form.fileId', errorType: 'string.guid', receivedValue: 'not-a-uuid' }
      ])
    })

    test('should handle non-array path as "unknown"', () => {
      const result = mapValidationErrors({
        details: [{ path: 'not-an-array', type: 'any.required', context: { value: undefined } }]
      })

      expect(result).toEqual([
        { field: 'unknown', errorType: 'any.required', receivedValue: null }
      ])
    })

    test('should handle missing error type as "unknown"', () => {
      const result = mapValidationErrors({
        details: [{ path: ['metadata', 'crn'], context: { value: 'test' } }]
      })

      expect(result).toEqual([
        { field: 'metadata.crn', errorType: 'unknown', receivedValue: 'test' }
      ])
    })

    test('should sanitise string values longer than 256 characters', () => {
      const result = mapValidationErrors({
        details: [{ path: ['field'], type: 'string.max', context: { value: 'a'.repeat(300) } }]
      })

      expect(result[0].receivedValue).toHaveLength(256)
      expect(result[0].receivedValue).toBe('a'.repeat(256))
    })

    test('should preserve string values shorter than 256 characters', () => {
      const result = mapValidationErrors({
        details: [{ path: ['field'], type: 'string.pattern.base', context: { value: 'short string' } }]
      })

      expect(result[0].receivedValue).toBe('short string')
    })

    test('should handle number values', () => {
      const result = mapValidationErrors({
        details: [{ path: ['field'], type: 'number.min', context: { value: 42 } }]
      })

      expect(result[0].receivedValue).toBe(42)
    })

    test('should handle boolean values', () => {
      const result = mapValidationErrors({
        details: [{ path: ['field'], type: 'boolean.base', context: { value: true } }]
      })

      expect(result[0].receivedValue).toBe(true)
    })

    test('should handle null values', () => {
      const result = mapValidationErrors({
        details: [{ path: ['field'], type: 'any.required', context: { value: null } }]
      })

      expect(result[0].receivedValue).toBeNull()
    })

    test('should handle undefined values', () => {
      const result = mapValidationErrors({
        details: [{ path: ['field'], type: 'any.required', context: { value: undefined } }]
      })

      expect(result[0].receivedValue).toBeNull()
    })

    test('should handle complex values (objects/arrays) as "[complex value]"', () => {
      const result = mapValidationErrors({
        details: [{ path: ['field'], type: 'object.unknown', context: { value: { nested: 'object' } } }]
      })

      expect(result[0].receivedValue).toBe('[complex value]')
    })

    test('should handle missing context', () => {
      const result = mapValidationErrors({
        details: [{ path: ['field'], type: 'any.required' }]
      })

      expect(result[0].receivedValue).toBeNull()
    })

    test('should handle empty path array', () => {
      const result = mapValidationErrors({
        details: [{ path: [], type: 'any.required', context: { value: 'test' } }]
      })

      expect(result[0].field).toBe('')
    })
  })

  describe('buildValidatedStatusDocuments', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-26T10:00:00Z'))
    })

    test('should build status documents for valid uploads', () => {
      const result = buildValidatedStatusDocuments(mockValidatedDocuments)

      expect(result).toEqual([
        {
          sbi: 105000000,
          fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
          timestamp: new Date('2026-02-26T10:00:00Z'),
          validated: true,
          errors: null
        },
        {
          sbi: 205000000,
          fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554',
          timestamp: new Date('2026-02-26T10:00:00Z'),
          validated: true,
          errors: null
        }
      ])
    })

    test('should return empty array for empty documents array', () => {
      const result = buildValidatedStatusDocuments([])

      expect(result).toEqual([])
    })

    test('should handle single document', () => {
      const result = buildValidatedStatusDocuments([{
        metadata: { sbi: 105000000 },
        file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' }
      }])

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        sbi: 105000000,
        fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
        validated: true,
        errors: null
      })
    })

    test('timestamp should be a Date instance', () => {
      const result = buildValidatedStatusDocuments([{
        metadata: { sbi: 105000000 },
        file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' }
      }])

      expect(result[0].timestamp).toBeInstanceOf(Date)
    })
  })

  describe('buildValidationFailureStatusDocuments', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-26T10:00:00Z'))
    })

    test('should build status documents with real fileIds from payload', () => {
      const result = buildValidationFailureStatusDocuments(
        mockPayloadWithFiles,
        mockRequiredFieldError
      )

      expect(result).toEqual([
        {
          sbi: 105000000,
          fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
          timestamp: new Date('2026-02-26T10:00:00Z'),
          validated: false,
          errors: [
            {
              field: 'metadata.crn',
              errorType: 'any.required',
              receivedValue: null
            }
          ]
        },
        {
          sbi: 105000000,
          fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554',
          timestamp: new Date('2026-02-26T10:00:00Z'),
          validated: false,
          errors: [
            {
              field: 'metadata.crn',
              errorType: 'any.required',
              receivedValue: null
            }
          ]
        }
      ])
    })

    test('should use "unknown" fileId when no valid fileIds in payload', () => {
      const result = buildValidationFailureStatusDocuments(
        mockPayloadNoFiles,
        mockRequiredFieldError
      )

      expect(result).toEqual([
        {
          sbi: 105000000,
          fileId: 'unknown',
          timestamp: new Date('2026-02-26T10:00:00Z'),
          validated: false,
          errors: [
            {
              field: 'metadata.crn',
              errorType: 'any.required',
              receivedValue: null
            }
          ]
        }
      ])
    })

    test('should use "unknown" fileId when form is missing', () => {
      const result = buildValidationFailureStatusDocuments(
        { metadata: { sbi: 123456789 }, submissionId: 'sub-123' },
        { details: [{ path: ['form'], type: 'any.required', context: { value: undefined } }] }
      )

      expect(result).toHaveLength(1)
      expect(result[0].fileId).toBe('unknown')
    })

    test('should use "unknown" fileId when form is empty', () => {
      const result = buildValidationFailureStatusDocuments(
        { metadata: { sbi: 123456789 }, form: {}, submissionId: 'sub-123' },
        mockRequiredFieldError
      )

      expect(result).toHaveLength(1)
      expect(result[0].fileId).toBe('unknown')
    })

    test('should filter out non-object form values', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 123456789 },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' }, text: 'string value', number: 42 },
          submissionId: 'sub-123'
        },
        mockRequiredFieldError
      )

      expect(result).toHaveLength(1)
      expect(result[0].fileId).toBe('9fcaabe5-77ec-44db-8356-3a6e8dc51b13')
    })

    test('should filter out null values in form', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 123456789 },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' }, nullField: null },
          submissionId: 'sub-123'
        },
        mockRequiredFieldError
      )

      expect(result).toHaveLength(1)
      expect(result[0].fileId).toBe('9fcaabe5-77ec-44db-8356-3a6e8dc51b13')
    })

    test('should filter out objects without fileId', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 123456789 },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' }, noFileId: { name: 'field' } },
          submissionId: 'sub-123'
        },
        mockRequiredFieldError
      )

      expect(result).toHaveLength(1)
      expect(result[0].fileId).toBe('9fcaabe5-77ec-44db-8356-3a6e8dc51b13')
    })

    test('should filter out objects with empty fileId', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 123456789 },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' }, emptyFileId: { fileId: '' } },
          submissionId: 'sub-123'
        },
        mockRequiredFieldError
      )

      expect(result).toHaveLength(1)
      expect(result[0].fileId).toBe('9fcaabe5-77ec-44db-8356-3a6e8dc51b13')
    })

    test('should filter out objects with non-string fileId', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 123456789 },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' }, numericFileId: { fileId: 12345 } },
          submissionId: 'sub-123'
        },
        mockRequiredFieldError
      )

      expect(result).toHaveLength(1)
      expect(result[0].fileId).toBe('9fcaabe5-77ec-44db-8356-3a6e8dc51b13')
    })

    test('should extract sbi from payload', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 105000000 },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' } },
          submissionId: 'sub-123'
        },
        mockRequiredFieldError
      )

      expect(result[0].sbi).toBe(105000000)
    })

    test('should return null sbi when sbi is missing', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: {},
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' } },
          submissionId: 'sub-123'
        },
        mockRequiredFieldError
      )

      expect(result[0].sbi).toBeNull()
    })

    test('should return null sbi when sbi is not an integer', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 'not a number' },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' } },
          submissionId: 'sub-123'
        },
        { details: [{ path: ['metadata', 'sbi'], type: 'number.base', context: { value: 'not a number' } }] }
      )

      expect(result[0].sbi).toBeNull()
    })

    test('should return null sbi when sbi is a float', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 105000000.5 },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' } },
          submissionId: 'sub-123'
        },
        { details: [{ path: ['metadata', 'sbi'], type: 'number.integer', context: { value: 105000000.5 } }] }
      )

      expect(result[0].sbi).toBeNull()
    })

    test('should return null sbi when metadata is missing', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' } },
          submissionId: 'sub-123'
        },
        { details: [{ path: ['metadata'], type: 'any.required', context: { value: undefined } }] }
      )

      expect(result[0].sbi).toBeNull()
    })

    test('should handle multiple validation errors', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 105000000 },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' } },
          submissionId: 'sub-123'
        },
        {
          details: [
            { path: ['metadata', 'crn'], type: 'any.required', context: { value: null } },
            { path: ['metadata', 'frn'], type: 'any.required', context: { value: null } }
          ]
        }
      )

      expect(result[0].errors).toHaveLength(2)
      expect(result[0].errors).toEqual([
        {
          field: 'metadata.crn',
          errorType: 'any.required',
          receivedValue: null
        },
        {
          field: 'metadata.frn',
          errorType: 'any.required',
          receivedValue: null
        }
      ])
    })

    test('timestamp should be a Date instance', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 105000000 },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' } },
          submissionId: 'sub-123'
        },
        mockRequiredFieldError
      )

      expect(result[0].timestamp).toBeInstanceOf(Date)
    })

    test('validated should be false', () => {
      const result = buildValidationFailureStatusDocuments(
        {
          metadata: { sbi: 105000000 },
          form: { file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' } },
          submissionId: 'sub-123'
        },
        mockRequiredFieldError
      )

      expect(result[0].validated).toBe(false)
    })
  })
})
