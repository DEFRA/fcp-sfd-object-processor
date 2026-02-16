import { describe, test, expect, vi, beforeEach } from 'vitest'
import Joi from 'joi'

import { logValidationFailure } from '../../../../../src/api/common/helpers/validation-logger.js'

describe('#validation-logger', () => {
  let mockLogger
  let mockRequest

  beforeEach(() => {
    mockLogger = {
      error: vi.fn()
    }
    mockRequest = {
      path: '/api/v1/callback',
      method: 'POST'
    }
  })

  describe('logValidationFailure', () => {
    test('logs validation error with correct structure', () => {
      const schema = Joi.object({
        name: Joi.string().required()
      })
      const { error } = schema.validate({})

      logValidationFailure(mockLogger, error, mockRequest)

      expect(mockLogger.error).toHaveBeenCalledTimes(1)
      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall).toHaveProperty('validationErrors')
      expect(logCall).toHaveProperty('path', '/api/v1/callback')
      expect(logCall).toHaveProperty('method', 'POST')
      expect(Array.isArray(logCall.validationErrors)).toBe(true)
    })

    test('extracts field path from Joi error details', () => {
      const schema = Joi.object({
        metadata: Joi.object({
          sbi: Joi.number().required()
        })
      })
      const { error } = schema.validate({ metadata: {} })

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall.validationErrors[0].field).toBe('metadata.sbi')
      expect(logCall.validationErrors[0].type).toBe('any.required')
    })

    test('sanitizes long string values by truncating to 100 characters', () => {
      const longString = 'a'.repeat(150)
      const schema = Joi.object({
        description: Joi.string().max(50)
      })
      const { error } = schema.validate({ description: longString })

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall.validationErrors[0].value).toBe('a'.repeat(100))
    })

    test('redacts metadata.reference field', () => {
      const schema = Joi.object({
        metadata: Joi.object({
          reference: Joi.string().max(10)
        })
      })
      const { error } = schema.validate({
        metadata: { reference: 'sensitive user data' }
      })

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall.validationErrors[0].field).toBe('metadata.reference')
      expect(logCall.validationErrors[0].value).toBe('[REDACTED]')
    })

    test('redacts metadata.files array', () => {
      const schema = Joi.object({
        metadata: Joi.object({
          files: Joi.array().items(Joi.string()).min(5)
        })
      })
      const { error } = schema.validate({
        metadata: { files: ['file1.pdf', 'file2.pdf'] }
      })

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall.validationErrors[0].field).toBe('metadata.files')
      expect(logCall.validationErrors[0].value).toBe('[REDACTED]')
    })

    test('handles multiple validation errors', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
        email: Joi.string().email().required()
      })
      const { error } = schema.validate({}, { abortEarly: false })

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall.validationErrors).toHaveLength(3)
      expect(logCall.validationErrors[0].field).toBe('name')
      expect(logCall.validationErrors[1].field).toBe('age')
      expect(logCall.validationErrors[2].field).toBe('email')
    })

    test('includes error message from Joi', () => {
      const schema = Joi.object({
        count: Joi.number().min(10)
      })
      const { error } = schema.validate({ count: 5 })

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall.validationErrors[0].message).toContain('must be greater than or equal to 10')
    })

    test('handles errors without value gracefully', () => {
      const schema = Joi.object({
        requiredField: Joi.string().required()
      })
      const { error } = schema.validate({})

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall.validationErrors[0].value).toBeUndefined()
    })

    test('sanitizes nested field paths correctly', () => {
      const schema = Joi.object({
        form: Joi.object({
          'file-upload': Joi.object({
            fileId: Joi.string().uuid()
          })
        })
      })
      const { error } = schema.validate({
        form: { 'file-upload': { fileId: 'not-a-uuid' } }
      })

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall.validationErrors[0].field).toBe('form.file-upload.fileId')
    })

    test('preserves error type from Joi', () => {
      const schema = Joi.object({
        status: Joi.string().valid('active', 'inactive')
      })
      const { error } = schema.validate({ status: 'pending' })

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall.validationErrors[0].type).toBe('any.only')
    })

    test('does not redact non-sensitive fields', () => {
      const schema = Joi.object({
        sbi: Joi.number().min(100000000)
      })
      const { error } = schema.validate({ sbi: 12345 })

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall.validationErrors[0].value).toBe(12345)
      expect(logCall.validationErrors[0].value).not.toBe('[REDACTED]')
    })

    test('includes overall error message', () => {
      const schema = Joi.object({
        name: Joi.string().required()
      })
      const { error } = schema.validate({})

      logValidationFailure(mockLogger, error, mockRequest)

      const logCall = mockLogger.error.mock.calls[0][0]
      expect(logCall).toHaveProperty('message')
      expect(logCall.message).toContain('Validation failed')
    })
  })
})
