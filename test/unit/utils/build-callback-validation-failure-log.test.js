import { describe, test, expect } from 'vitest'

import {
  buildCallbackValidationFailureLog,
  buildCallbackPersistFailureLog
} from '../../../src/utils/build-callback-validation-failure-log.js'

const mockRequest = {
  path: '/api/v1/callback',
  method: 'post',
  payload: {
    metadata: { uosr: 'sub-123' }
  }
}

describe('buildCallbackValidationFailureLog', () => {
  const err = Object.assign(new Error('Validation failed'), { stack: 'Error: Validation failed\n  at ...' })

  test('returns nested event and error objects with approved ECS fields', () => {
    const log = buildCallbackValidationFailureLog(mockRequest, err)

    expect(log).toEqual({
      event: {
        type: 'callback_validation_failure',
        action: 'post',
        category: '/api/v1/callback',
        outcome: 'failure',
        reference: 'sub-123',
        fileIds: ['unknown']
      },
      error: {
        code: null,
        message: 'Validation failed',
        stack_trace: err.stack,
        type: 'Error'
      }
    })
  })

  test('includes fileIds extracted from payload form', () => {
    const request = {
      ...mockRequest,
      payload: {
        metadata: { uosr: 'sub-123' },
        form: {
          'file-one': { fileId: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee' },
          'file-two': { fileId: 'ffffffff-0000-4111-2222-333333333333' }
        }
      }
    }
    const log = buildCallbackValidationFailureLog(request, err)
    expect(log.event.fileIds).toEqual([
      'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
      'ffffffff-0000-4111-2222-333333333333'
    ])
  })

  test('falls back to ["unknown"] when form is absent from payload', () => {
    const request = { ...mockRequest, payload: { metadata: { uosr: 'sub-123' } } }
    const log = buildCallbackValidationFailureLog(request, err)
    expect(log.event.fileIds).toEqual(['unknown'])
  })

  test('falls back to ["unknown"] when payload is null', () => {
    const request = { ...mockRequest, payload: null }
    const log = buildCallbackValidationFailureLog(request, err)
    expect(log.event.fileIds).toEqual(['unknown'])
  })

  test('uses uosr from payload as event.reference', () => {
    const log = buildCallbackValidationFailureLog(mockRequest, err)
    expect(log.event.reference).toBe('sub-123')
  })

  test('sets event.reference to undefined when payload is null', () => {
    const request = { ...mockRequest, payload: null }
    const log = buildCallbackValidationFailureLog(request, err)
    expect(log.event.reference).toBeUndefined()
  })

  test('sets event.reference to undefined when metadata is absent', () => {
    const request = { ...mockRequest, payload: {} }
    const log = buildCallbackValidationFailureLog(request, err)
    expect(log.event.reference).toBeUndefined()
  })

  test('maps error.code from err.statusCode', () => {
    const errWithStatus = Object.assign(new Error('Boom'), { statusCode: 422 })
    const log = buildCallbackValidationFailureLog(mockRequest, errWithStatus)
    expect(log.error.code).toBe(422)
  })

  test('falls back to err.code when statusCode is absent', () => {
    const errWithCode = Object.assign(new Error('DB error'), { code: 'ECONNREFUSED' })
    const log = buildCallbackValidationFailureLog(mockRequest, errWithCode)
    expect(log.error.code).toBe('ECONNREFUSED')
  })

  test('sets error.type to constructor name', () => {
    class ValidationError extends Error {}
    const log = buildCallbackValidationFailureLog(mockRequest, new ValidationError('bad'))
    expect(log.error.type).toBe('ValidationError')
  })

  test('falls back to err.name when constructor name is absent', () => {
    const plainErr = Object.create(null)
    plainErr.message = 'plain object error'
    plainErr.name = 'CustomError'
    const log = buildCallbackValidationFailureLog(mockRequest, plainErr)
    expect(log.error.type).toBe('CustomError')
  })

  test('falls back to Error when both constructor name and err.name are absent', () => {
    const plainErr = Object.create(null)
    plainErr.message = 'plain object error'
    const log = buildCallbackValidationFailureLog(mockRequest, plainErr)
    expect(log.error.type).toBe('Error')
  })

  test('does not include event.reason (auth is disabled on this route)', () => {
    const log = buildCallbackValidationFailureLog(mockRequest, err)
    expect(log.event.reason).toBeUndefined()
    expect(Object.keys(log.event)).not.toContain('reason')
  })
})

describe('buildCallbackPersistFailureLog', () => {
  const persistError = Object.assign(new Error('DB write failed'), { stack: 'Error: DB write failed\n  at ...' })

  test('returns nested event and error objects with approved ECS fields', () => {
    const log = buildCallbackPersistFailureLog(mockRequest, persistError)

    expect(log).toEqual({
      event: {
        type: 'callback_validation_persist_failure',
        action: 'post',
        category: '/api/v1/callback',
        outcome: 'failure',
        reference: 'sub-123'
      },
      error: {
        code: null,
        message: 'DB write failed',
        stack_trace: persistError.stack,
        type: 'Error'
      }
    })
  })

  test('uses uosr from payload as event.reference', () => {
    const log = buildCallbackPersistFailureLog(mockRequest, persistError)
    expect(log.event.reference).toBe('sub-123')
  })

  test('sets event.reference to undefined when payload is null', () => {
    const request = { ...mockRequest, payload: null }
    const log = buildCallbackPersistFailureLog(request, persistError)
    expect(log.event.reference).toBeUndefined()
  })

  test('sets event.reference to undefined when metadata is absent', () => {
    const request = { ...mockRequest, payload: {} }
    const log = buildCallbackPersistFailureLog(request, persistError)
    expect(log.event.reference).toBeUndefined()
  })

  test('maps error.code from persistError.statusCode', () => {
    const errWithStatus = Object.assign(new Error('Boom'), { statusCode: 500 })
    const log = buildCallbackPersistFailureLog(mockRequest, errWithStatus)
    expect(log.error.code).toBe(500)
  })

  test('falls back to persistError.code when statusCode is absent', () => {
    const errWithCode = Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' })
    const log = buildCallbackPersistFailureLog(mockRequest, errWithCode)
    expect(log.error.code).toBe('ETIMEDOUT')
  })

  test('sets error.type to constructor name', () => {
    class MongoWriteError extends Error {}
    const log = buildCallbackPersistFailureLog(mockRequest, new MongoWriteError('write failed'))
    expect(log.error.type).toBe('MongoWriteError')
  })

  test('falls back to persistError.name when constructor name is absent', () => {
    const plainErr = Object.create(null)
    plainErr.message = 'plain object error'
    plainErr.name = 'MongoError'
    const log = buildCallbackPersistFailureLog(mockRequest, plainErr)
    expect(log.error.type).toBe('MongoError')
  })

  test('falls back to Error when both constructor name and persistError.name are absent', () => {
    const plainErr = Object.create(null)
    plainErr.message = 'plain object error'
    const log = buildCallbackPersistFailureLog(mockRequest, plainErr)
    expect(log.error.type).toBe('Error')
  })

  test('does not include event.reason (auth is disabled on this route)', () => {
    const log = buildCallbackPersistFailureLog(mockRequest, persistError)
    expect(log.event.reason).toBeUndefined()
    expect(Object.keys(log.event)).not.toContain('reason')
  })
})
