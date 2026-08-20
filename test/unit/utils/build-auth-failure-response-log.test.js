import { constants as httpConstants } from 'node:http2'
import { describe, test, expect } from 'vitest'

import { buildAuthFailureResponseLog } from '../../../src/utils/build-auth-failure-response-log.js'

describe('buildAuthFailureResponseLog', () => {
  const baseRequest = {
    path: '/api/v1/metadata',
    method: 'GET',
    info: { remoteAddress: '10.0.0.1' },
    headers: { 'user-agent': 'test-agent' }
  }

  test('returns a nested event/client/user_agent object with approved ECS fields', () => {
    const log = buildAuthFailureResponseLog(baseRequest, 'Unauthorized')

    expect(log).toEqual({
      event: {
        type: 'auth_failure',
        action: 'GET',
        category: '/api/v1/metadata',
        reason: 'Unauthorized',
        outcome: 'failure',
        kind: httpConstants.HTTP_STATUS_UNAUTHORIZED
      },
      client: { address: '10.0.0.1' },
      user_agent: { original: 'test-agent' }
    })
  })

  test('appends token groups and issuer to event.reason for an Entra token', () => {
    const request = {
      ...baseRequest,
      auth: {
        artifacts: {
          decoded: {
            payload: { groups: ['group-1', 'group-2'], iss: 'https://sts.windows.net/tenant-a/' }
          }
        }
      }
    }

    const log = buildAuthFailureResponseLog(request, 'Unauthorized')

    expect(log.event.reason).toBe('Unauthorized | groups=group-1,group-2 | issuer=https://sts.windows.net/tenant-a/')
  })

  test('appends clientId to event.reason for a Cognito token', () => {
    const request = {
      ...baseRequest,
      auth: {
        artifacts: {
          decoded: {
            payload: { client_id: 'cognito-client-1' }
          }
        }
      }
    }

    const log = buildAuthFailureResponseLog(request, 'Unauthorized')

    expect(log.event.reason).toBe('Unauthorized | clientId=cognito-client-1')
  })

  test('sets event.reason to only the sanitised message when no token is decoded', () => {
    const log = buildAuthFailureResponseLog(baseRequest, 'Missing token')

    expect(log.event.reason).toBe('Missing token')
  })

  test('sets event.reason to only the sanitised message when request.auth is present but has no artifacts', () => {
    const request = { ...baseRequest, auth: {} }

    const log = buildAuthFailureResponseLog(request, 'Missing token')

    expect(log.event.reason).toBe('Missing token')
  })
})
