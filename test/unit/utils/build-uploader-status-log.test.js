import { constants as httpConstants } from 'node:http2'
import { describe, test, expect } from 'vitest'

import {
  buildStatusRequestLog,
  buildStatusResponseLog
} from '../../../src/utils/build-uploader-status-log.js'

describe('buildStatusRequestLog', () => {
  const uploadId = '9fcaabe5-77ec-44db-8356-3a6e8dc51b13'

  test('returns a nested event object with approved ECS fields', () => {
    const request = {
      path: '/api/v1/uploader/status/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      method: 'get',
      auth: {
        artifacts: {
          decoded: {
            payload: { client_id: 'test-client' }
          }
        }
      }
    }

    const log = buildStatusRequestLog(request, uploadId)

    expect(log).toEqual({
      event: {
        type: 'status_check',
        action: request.method,
        category: request.path,
        reference: uploadId,
        reason: 'test-client'
      }
    })
  })

  test('sets event.reason to undefined when auth artifacts are absent', () => {
    const request = {
      path: '/api/v1/uploader/status/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      method: 'get',
      auth: null
    }

    const log = buildStatusRequestLog(request, uploadId)

    expect(log.event.reason).toBeUndefined()
    expect(log.event.type).toBe('status_check')
    expect(log.event.reference).toBe(uploadId)
  })
})

describe('buildStatusResponseLog', () => {
  const uploadId = '9fcaabe5-77ec-44db-8356-3a6e8dc51b13'

  test('returns a nested event object with approved ECS fields', () => {
    const cdpResponse = { uploadStatus: 'ready' }
    const durationMs = 142

    const log = buildStatusResponseLog(uploadId, cdpResponse, durationMs)

    expect(log).toEqual({
      event: {
        type: 'status_check',
        outcome: 'success',
        duration: durationMs * 1_000_000,
        reference: uploadId,
        reason: 'ready',
        kind: httpConstants.HTTP_STATUS_OK
      }
    })
  })

  test('converts duration from milliseconds to nanoseconds', () => {
    const log = buildStatusResponseLog(uploadId, { uploadStatus: 'ready' }, 1)
    expect(log.event.duration).toBe(1_000_000)
  })

  test('sets event.reason to the CDP uploadStatus value', () => {
    const log = buildStatusResponseLog(uploadId, { uploadStatus: 'pending' }, 50)
    expect(log.event.reason).toBe('pending')
  })

  test('sets event.kind to the HTTP 200 status code', () => {
    const log = buildStatusResponseLog(uploadId, { uploadStatus: 'ready' }, 50)
    expect(log.event.kind).toBe(httpConstants.HTTP_STATUS_OK)
  })
})
