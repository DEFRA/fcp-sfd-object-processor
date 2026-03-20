import { describe, test, expect } from 'vitest'
import { buildAuthFailureLog } from '../../../src/utils/build-auth-failure-log.js'

describe('buildAuthFailureLog', () => {
  const mockRequest = {
    path: '/test',
    method: 'GET',
    info: { remoteAddress: '127.0.0.1' }
  }

  test('should set msg to Authentication failed', () => {
    const result = buildAuthFailureLog('some reason', mockRequest)

    expect(result.msg).toEqual('Authentication failed')
  })

  test('should include reason, path, method and sourceIp from args', () => {
    const result = buildAuthFailureLog('some reason', mockRequest)

    expect(result).toEqual({
      msg: 'Authentication failed',
      reason: 'some reason',
      path: '/test',
      method: 'GET',
      sourceIp: '127.0.0.1'
    })
  })

  test('should default extra to empty object when not provided', () => {
    const result = buildAuthFailureLog('some reason', mockRequest)

    expect(Object.keys(result)).toHaveLength(5)
  })

  test('should merge minimal extra with strategy into result', () => {
    const result = buildAuthFailureLog('some reason', mockRequest, {
      strategy: 'entra'
    })

    expect(result).toEqual({
      msg: 'Authentication failed',
      reason: 'some reason',
      path: '/test',
      method: 'GET',
      sourceIp: '127.0.0.1',
      strategy: 'entra'
    })
  })

  test('should merge tokenType and strategy into result', () => {
    const result = buildAuthFailureLog(
      'Provided token is not an access token',
      mockRequest,
      { tokenType: 'refresh', strategy: 'entra' }
    )

    expect(result).toEqual({
      msg: 'Authentication failed',
      reason: 'Provided token is not an access token',
      path: '/test',
      method: 'GET',
      sourceIp: '127.0.0.1',
      tokenType: 'refresh',
      strategy: 'entra'
    })
  })

  test('should merge tokenGroups, requiredGroups and strategy into result', () => {
    const result = buildAuthFailureLog(
      'Token does not belong to an authorized Security Group',
      mockRequest,
      {
        tokenGroups: ['group-3', 'group-4'],
        requiredGroups: ['group-1', 'group-2'],
        strategy: 'entra'
      }
    )

    expect(result).toEqual({
      msg: 'Authentication failed',
      reason: 'Token does not belong to an authorized Security Group',
      path: '/test',
      method: 'GET',
      sourceIp: '127.0.0.1',
      tokenGroups: ['group-3', 'group-4'],
      requiredGroups: ['group-1', 'group-2'],
      strategy: 'entra'
    })
  })

  test('should merge clientId, issuer and strategy into result', () => {
    const result = buildAuthFailureLog(
      'Token client_id is not in the list of authorized Cognito client IDs',
      mockRequest,
      {
        clientId: 'unauthorized-client',
        issuer:
          'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId',
        strategy: 'cognito'
      }
    )

    expect(result).toEqual({
      msg: 'Authentication failed',
      reason:
        'Token client_id is not in the list of authorized Cognito client IDs',
      path: '/test',
      method: 'GET',
      sourceIp: '127.0.0.1',
      clientId: 'unauthorized-client',
      issuer:
        'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId',
      strategy: 'cognito'
    })
  })

  test('should allow extra fields to override base fields', () => {
    const result = buildAuthFailureLog('original reason', mockRequest, {
      msg: 'Overridden message',
      sourceIp: '10.0.0.1'
    })

    expect(result.msg).toEqual('Overridden message')
    expect(result.sourceIp).toEqual('10.0.0.1')
    expect(result.reason).toEqual('original reason')
  })
})
