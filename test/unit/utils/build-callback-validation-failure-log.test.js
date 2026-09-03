import { describe, test, expect } from 'vitest'

import {
  buildCallbackValidationFailureLog,
  buildCallbackPersistFailureLog
} from '../../../src/utils/build-callback-validation-failure-log.js'

const mockJourneyId = '550e8400-e29b-41d4-a716-446655440000'

// uosr embeds the CRN (e.g. "SBI_submissionId") and must never appear in a log field —
// see FLS1-175. It is only present here to prove it is NOT read by the log builders.
const mockRequest = {
  path: '/api/v1/callback',
  method: 'post',
  payload: {
    metadata: { uosr: '105000000_1733826312' }
  }
}

describe('buildCallbackValidationFailureLog', () => {
  const err = Object.assign(new Error('Validation failed'), { stack: 'Error: Validation failed\n  at ...' })

  test('returns nested event and error objects with approved ECS fields', () => {
    const log = buildCallbackValidationFailureLog(mockRequest, err, mockJourneyId)

    expect(log).toEqual({
      'cdp-uploader': {
        fileIds: ['unknown']
      },
      event: {
        type: 'callback_validation_failure',
        action: 'post',
        category: '/api/v1/callback',
        outcome: 'failure',
        reference: mockJourneyId
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
        metadata: { uosr: '105000000_1733826312' },
        form: {
          'file-one': { fileId: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee' },
          'file-two': { fileId: 'ffffffff-0000-4111-2222-333333333333' }
        }
      }
    }
    const log = buildCallbackValidationFailureLog(request, err, mockJourneyId)
    expect(log['cdp-uploader'].fileIds).toEqual([
      'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
      'ffffffff-0000-4111-2222-333333333333'
    ])
    expect(log.event.fileIds).toBeUndefined()
  })

  test('falls back to ["unknown"] when form is absent from payload', () => {
    const request = { ...mockRequest, payload: { metadata: { uosr: '105000000_1733826312' } } }
    const log = buildCallbackValidationFailureLog(request, err, mockJourneyId)
    expect(log['cdp-uploader'].fileIds).toEqual(['unknown'])
  })

  test('falls back to ["unknown"] when payload is null', () => {
    const request = { ...mockRequest, payload: null }
    const log = buildCallbackValidationFailureLog(request, err, mockJourneyId)
    expect(log['cdp-uploader'].fileIds).toEqual(['unknown'])
  })

  test('uses the resolved journeyId as event.reference', () => {
    const log = buildCallbackValidationFailureLog(mockRequest, err, mockJourneyId)
    expect(log.event.reference).toBe(mockJourneyId)
  })

  test('sets event.reference to undefined when no journeyId is supplied', () => {
    const log = buildCallbackValidationFailureLog(mockRequest, err)
    expect(log.event.reference).toBeUndefined()
  })

  test('never uses payload.metadata.uosr (CRN) as event.reference', () => {
    const log = buildCallbackValidationFailureLog(mockRequest, err, mockJourneyId)
    expect(log.event.reference).not.toBe(mockRequest.payload.metadata.uosr)
    expect(JSON.stringify(log)).not.toContain('105000000_1733826312')
  })

  test('maps error.code from err.statusCode', () => {
    const errWithStatus = Object.assign(new Error('Boom'), { statusCode: 422 })
    const log = buildCallbackValidationFailureLog(mockRequest, errWithStatus, mockJourneyId)
    expect(log.error.code).toBe(422)
  })

  test('falls back to err.code when statusCode is absent', () => {
    const errWithCode = Object.assign(new Error('DB error'), { code: 'ECONNREFUSED' })
    const log = buildCallbackValidationFailureLog(mockRequest, errWithCode, mockJourneyId)
    expect(log.error.code).toBe('ECONNREFUSED')
  })

  test('sets error.type to constructor name', () => {
    class ValidationError extends Error {}
    const log = buildCallbackValidationFailureLog(mockRequest, new ValidationError('bad'), mockJourneyId)
    expect(log.error.type).toBe('ValidationError')
  })

  test('falls back to err.name when constructor name is absent', () => {
    const plainErr = Object.create(null)
    plainErr.message = 'plain object error'
    plainErr.name = 'CustomError'
    const log = buildCallbackValidationFailureLog(mockRequest, plainErr, mockJourneyId)
    expect(log.error.type).toBe('CustomError')
  })

  test('falls back to Error when both constructor name and err.name are absent', () => {
    const plainErr = Object.create(null)
    plainErr.message = 'plain object error'
    const log = buildCallbackValidationFailureLog(mockRequest, plainErr, mockJourneyId)
    expect(log.error.type).toBe('Error')
  })

  test('does not include event.reason (auth is disabled on this route)', () => {
    const log = buildCallbackValidationFailureLog(mockRequest, err, mockJourneyId)
    expect(log.event.reason).toBeUndefined()
    expect(Object.keys(log.event)).not.toContain('reason')
  })
})

describe('buildCallbackPersistFailureLog', () => {
  const persistError = Object.assign(new Error('DB write failed'), { stack: 'Error: DB write failed\n  at ...' })

  test('returns nested event and error objects with approved ECS fields', () => {
    const log = buildCallbackPersistFailureLog(mockRequest, persistError, mockJourneyId)

    expect(log).toEqual({
      event: {
        type: 'callback_validation_persist_failure',
        action: 'post',
        category: '/api/v1/callback',
        outcome: 'failure',
        reference: mockJourneyId
      },
      error: {
        code: null,
        message: 'DB write failed',
        stack_trace: persistError.stack,
        type: 'Error'
      }
    })
  })

  test('uses the resolved journeyId as event.reference', () => {
    const log = buildCallbackPersistFailureLog(mockRequest, persistError, mockJourneyId)
    expect(log.event.reference).toBe(mockJourneyId)
  })

  test('sets event.reference to undefined when no journeyId is supplied', () => {
    const log = buildCallbackPersistFailureLog(mockRequest, persistError)
    expect(log.event.reference).toBeUndefined()
  })

  test('never uses payload.metadata.uosr (CRN) as event.reference', () => {
    const log = buildCallbackPersistFailureLog(mockRequest, persistError, mockJourneyId)
    expect(log.event.reference).not.toBe(mockRequest.payload.metadata.uosr)
    expect(JSON.stringify(log)).not.toContain('105000000_1733826312')
  })

  test('maps error.code from persistError.statusCode', () => {
    const errWithStatus = Object.assign(new Error('Boom'), { statusCode: 500 })
    const log = buildCallbackPersistFailureLog(mockRequest, errWithStatus, mockJourneyId)
    expect(log.error.code).toBe(500)
  })

  test('falls back to persistError.code when statusCode is absent', () => {
    const errWithCode = Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' })
    const log = buildCallbackPersistFailureLog(mockRequest, errWithCode, mockJourneyId)
    expect(log.error.code).toBe('ETIMEDOUT')
  })

  test('sets error.type to constructor name', () => {
    class MongoWriteError extends Error {}
    const log = buildCallbackPersistFailureLog(mockRequest, new MongoWriteError('write failed'), mockJourneyId)
    expect(log.error.type).toBe('MongoWriteError')
  })

  test('falls back to persistError.name when constructor name is absent', () => {
    const plainErr = Object.create(null)
    plainErr.message = 'plain object error'
    plainErr.name = 'MongoError'
    const log = buildCallbackPersistFailureLog(mockRequest, plainErr, mockJourneyId)
    expect(log.error.type).toBe('MongoError')
  })

  test('falls back to Error when both constructor name and persistError.name are absent', () => {
    const plainErr = Object.create(null)
    plainErr.message = 'plain object error'
    const log = buildCallbackPersistFailureLog(mockRequest, plainErr, mockJourneyId)
    expect(log.error.type).toBe('Error')
  })

  test('does not include event.reason (auth is disabled on this route)', () => {
    const log = buildCallbackPersistFailureLog(mockRequest, persistError, mockJourneyId)
    expect(log.event.reason).toBeUndefined()
    expect(Object.keys(log.event)).not.toContain('reason')
  })
})
