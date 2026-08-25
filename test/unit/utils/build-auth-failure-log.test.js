import { describe, expect, test } from 'vitest'
import { buildAuthFailureLog } from '../../../src/utils/build-auth-failure-log.js'

describe('buildAuthFailureLog', () => {
  const mockRequest = {
    path: '/test',
    method: 'GET',
    info: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'test-agent' }
  }

  test('should set msg to Authentication failed', () => {
    const result = buildAuthFailureLog('some reason', mockRequest)

    expect(result.msg).toEqual('Authentication failed')
  })

  test('should nest request context under approved ECS fields', () => {
    const result = buildAuthFailureLog('some reason', mockRequest)

    expect(result).toEqual({
      msg: 'Authentication failed',
      event: {
        type: 'auth_validation_failure',
        action: 'GET',
        category: '/test',
        reason: 'some reason',
        outcome: 'failure'
      },
      client: {
        address: '127.0.0.1'
      },
      user_agent: {
        original: 'test-agent'
      }
    })
  })

  test('should not emit any flat top-level context keys', () => {
    const result = buildAuthFailureLog('some reason', mockRequest, { strategy: 'entra' })

    expect(Object.keys(result)).toEqual(['msg', 'event', 'client', 'user_agent'])
  })

  test('should default extra to empty object when not provided', () => {
    const result = buildAuthFailureLog('some reason', mockRequest)

    expect(result.event.reason).toEqual('some reason')
  })

  test('should leave the reason unchanged when extra is empty', () => {
    const result = buildAuthFailureLog('some reason', mockRequest, {})

    expect(result.event.reason).toEqual('some reason')
  })

  test('should fold a scalar extra value into the reason', () => {
    const result = buildAuthFailureLog('some reason', mockRequest, { strategy: 'entra' })

    expect(result.event.reason).toEqual('some reason | strategy=entra')
  })

  test('should join an array extra value with commas', () => {
    const result = buildAuthFailureLog('some reason', mockRequest, { tokenGroups: ['group-3', 'group-4'] })

    expect(result.event.reason).toEqual('some reason | tokenGroups=group-3,group-4')
  })

  test('should omit an extra value that is undefined', () => {
    const result = buildAuthFailureLog('some reason', mockRequest, { strategy: undefined, issuer: 'https://issuer' })

    expect(result.event.reason).toEqual('some reason | issuer=https://issuer')
  })

  test('should omit an extra value that is null', () => {
    const result = buildAuthFailureLog('some reason', mockRequest, { strategy: null, issuer: 'https://issuer' })

    expect(result.event.reason).toEqual('some reason | issuer=https://issuer')
  })

  test('should keep an extra value that is an empty string', () => {
    const result = buildAuthFailureLog('some reason', mockRequest, { strategy: '' })

    expect(result.event.reason).toEqual('some reason | strategy=')
  })

  test('should fold tokenType and strategy into the reason', () => {
    const result = buildAuthFailureLog('Provided token is not an access token', mockRequest, {
      tokenType: 'refresh',
      strategy: 'entra'
    })

    expect(result.event.reason).toEqual(
      'Provided token is not an access token | tokenType=refresh | strategy=entra'
    )
  })

  test('should fold tokenGroups, requiredGroups and strategy into the reason', () => {
    const result = buildAuthFailureLog(
      'Token does not belong to an authorized Security Group',
      mockRequest,
      { tokenGroups: ['group-3', 'group-4'], requiredGroups: ['group-1', 'group-2'], strategy: 'entra' }
    )

    expect(result.event.reason).toEqual(
      'Token does not belong to an authorized Security Group | tokenGroups=group-3,group-4 | requiredGroups=group-1,group-2 | strategy=entra'
    )
  })

  test('should fold clientId, issuer and strategy into the reason', () => {
    const result = buildAuthFailureLog(
      'Token client_id is not in the list of authorized Cognito client IDs',
      mockRequest,
      {
        clientId: 'unauthorized-client',
        issuer: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId',
        strategy: 'cognito'
      }
    )

    expect(result.event.reason).toEqual(
      'Token client_id is not in the list of authorized Cognito client IDs | clientId=unauthorized-client | issuer=https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId | strategy=cognito'
    )
  })

  test('should set user_agent.original to undefined when the header is absent', () => {
    const result = buildAuthFailureLog('some reason', { ...mockRequest, headers: {} })

    expect(result.user_agent.original).toBeUndefined()
  })
})
