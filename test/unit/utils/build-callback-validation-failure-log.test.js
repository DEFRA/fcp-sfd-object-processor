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
        reference: 'sub-123'
      },
      error: {
        code: undefined,
        message: 'Validation failed',
        stack_trace: err.stack,
        type: 'Error'
      }
    })
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
        code: undefined,
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

  test('does not include event.reason (auth is disabled on this route)', () => {
    const log = buildCallbackPersistFailureLog(mockRequest, persistError)
    expect(log.event.reason).toBeUndefined()
    expect(Object.keys(log.event)).not.toContain('reason')
  })
})
