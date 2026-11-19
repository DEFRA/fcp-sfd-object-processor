import { describe, test, expect } from 'vitest'

import {
  buildResponseValidationFailureLog,
  RESPONSE_VALIDATION_FAILED
} from '../../../src/utils/build-response-validation-failure-log.js'

const mockRequest = {
  path: '/api/v1/metadata/sbi/805000000',
  method: 'get'
}

const crnValue = 99999999999
const fileIdValue = 'not-a-uuid-value'

const buildValidationError = () => {
  const err = new Error(`"data[0].metadata.crn" must be less than or equal to 9999999999. Value ${crnValue}`)
  err.details = [
    {
      message: `"data[0].metadata.crn" failed with value ${crnValue}`,
      path: ['data', 0, 'metadata', 'crn'],
      type: 'number.max',
      context: { value: crnValue, key: 'crn' }
    },
    {
      message: `"data[1].file.fileId" failed with value ${fileIdValue}`,
      path: ['data', 1, 'file', 'fileId'],
      type: 'string.guid',
      context: { value: fileIdValue, key: 'fileId' }
    }
  ]
  err._original = { data: [{ metadata: { crn: crnValue } }, { file: { fileId: fileIdValue } }] }
  return err
}

describe('buildResponseValidationFailureLog', () => {
  test('returns nested event and error objects with approved ECS fields', () => {
    const log = buildResponseValidationFailureLog(mockRequest, buildValidationError())

    expect(log).toEqual({
      event: {
        type: 'response_validation_failure',
        action: 'get',
        category: 'api',
        outcome: 'failure',
        reason: 'data.0.metadata.crn, data.1.file.fileId'
      },
      url: { path: '/api/v1/metadata/sbi/805000000' },
      error: {
        type: 'ResponseValidationError',
        message: RESPONSE_VALIDATION_FAILED
      }
    })
    expect(log.event.category).toBe('api')
    expect(log.event.category).not.toBe(mockRequest.path)
    expect(log.url.path).toBe(mockRequest.path)
  })

  test('does not include any value, message or stack from the validation error', () => {
    const serialised = JSON.stringify(buildResponseValidationFailureLog(mockRequest, buildValidationError()))

    expect(serialised).not.toContain(String(crnValue))
    expect(serialised).not.toContain(fileIdValue)
    expect(serialised).not.toContain('must be less than')
    expect(serialised).not.toContain('stack')
  })

  test('sets an empty reason when the error carries no details', () => {
    const log = buildResponseValidationFailureLog(mockRequest, new Error('no details'))

    expect(log.event.reason).toBe('')
  })

  test('does not use flattened dot keys', () => {
    const log = buildResponseValidationFailureLog(mockRequest, buildValidationError())

    Object.keys(log).forEach(key => expect(key).not.toContain('.'))
  })
})
