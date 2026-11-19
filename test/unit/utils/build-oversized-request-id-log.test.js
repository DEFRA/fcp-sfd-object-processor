import { describe, test, expect } from 'vitest'

import { buildOversizedRequestIdLog } from '../../../src/utils/build-oversized-request-id-log.js'

describe('buildOversizedRequestIdLog', () => {
  test('returns the request path, HTTP status and header length in ECS fields', () => {
    const request = {
      method: 'GET',
      path: '/api/v1/metadata/sbi/805000000'
    }

    const log = buildOversizedRequestIdLog(request, 51)

    expect(log).toEqual({
      event: {
        type: 'request_id_too_long',
        action: 'GET',
        category: 'api',
        reason: 'header_length=51',
        outcome: 'failure'
      },
      http: { response: { status_code: 400 } },
      url: { path: '/api/v1/metadata/sbi/805000000' }
    })
    expect(log.http.response.status_code).toBeTypeOf('number')
    expect(log.url.path).toBe(request.path)
    expect(log.event.category).not.toBe(request.path)
    expect(log.event).not.toHaveProperty('kind')
  })
})
