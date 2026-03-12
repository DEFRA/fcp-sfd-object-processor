import { expect, test, describe, beforeEach, vi } from 'vitest'

const mockConfigGet = vi.fn()
vi.mock('../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({ warn: vi.fn() })
}))

const mockBuildAuthFailureLog = vi.fn()
vi.mock('../../../../src/utils/build-auth-failure-log.js', () => ({
  buildAuthFailureLog: mockBuildAuthFailureLog
}))

describe('getCognitoAuthOptions', () => {
  let getCognitoAuthOptions

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    mockConfigGet.mockImplementation((key) => {
      switch (key) {
        case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
        case 'auth.cognito.clientIds': return ['client-1', 'client-2']
        default: return null
      }
    })

    const module = await import('../../../../src/plugins/auth/cognito-options.js')
    getCognitoAuthOptions = module.getCognitoAuthOptions
  })

  // Options shape — JWKS endpoint, region derivation, verify settings
  describe('options shape', () => {
    test('should build JWKS keys URI from user pool ID and derived region', () => {
      const options = getCognitoAuthOptions()
      expect(options.keys.uri).toBe('https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId/.well-known/jwks.json')
    })

    test('should set issuer from derived region and user pool ID', () => {
      const options = getCognitoAuthOptions()
      expect(options.verify.iss).toEqual(['https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId'])
    })

    test('should configure verify options with aud and sub disabled', () => {
      const options = getCognitoAuthOptions()
      expect(options.verify).toMatchObject({ aud: false, sub: false, nbf: true, exp: true })
    })

    test('should expose a validate function', () => {
      const options = getCognitoAuthOptions()
      expect(options.validate).toBeInstanceOf(Function)
    })

    test('should derive region and issuer correctly for different regions', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.cognito.userPoolId': return 'us-east-1_AbCdEfGhI'
          case 'auth.cognito.clientIds': return ['abc123']
          default: return null
        }
      })

      const { getCognitoAuthOptions: freshOptions } = await import('../../../../src/plugins/auth/cognito-options.js')
      const options = freshOptions()
      expect(options.keys.uri).toBe('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCdEfGhI/.well-known/jwks.json')
      expect(options.verify.iss).toEqual(['https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCdEfGhI'])
    })
  })

  // Token validation — acceptance and rejection logic
  describe('validate function', () => {
    let cognitoValidateFunction
    let mockRequest

    beforeEach(() => {
      cognitoValidateFunction = getCognitoAuthOptions().validate
      mockRequest = {
        path: '/test',
        method: 'GET',
        info: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' }
      }
    })

    // Valid token acceptance
    test('should return valid result for valid JWT token with allowed client_id', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'service-account-123',
        client_id: 'client-1',
        iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId'
      }
      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
      expect(result.credentials).toEqual({ token: payload, principalId: 'service-account-123' })
    })

    test('should return valid result for at+jwt token type', async () => {
      const payload = { typ: 'at+jwt', sub: 'service-account-123', client_id: 'client-2' }
      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
    })

    test('should accept token without typ claim', async () => {
      const payload = { sub: 'service-account-123', client_id: 'client-1' }
      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
    })

    test('should accept token when client_id matches one of multiple allowed IDs', async () => {
      const payload = { typ: 'JWT', sub: 'service-account-123', client_id: 'client-2' }
      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
      expect(result.credentials.principalId).toBe('service-account-123')
    })

    test('should preserve all token payload fields in credentials', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'service-account-123',
        client_id: 'client-1',
        iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId',
        scope: 'openid',
        custom_claim: 'custom_value'
      }
      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
      expect(result.credentials.token).toEqual(payload)
      expect(result.credentials.token.scope).toBe('openid')
      expect(result.credentials.token.custom_claim).toBe('custom_value')
    })

    // Invalid token rejection
    test('should reject token with invalid type', async () => {
      const payload = {
        typ: 'id_token',
        sub: 'service-account-123',
        client_id: 'client-1',
        iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId'
      }
      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Provided token is not an access token')
    })

    test('should reject token with missing client_id', async () => {
      const payload = { typ: 'JWT', sub: 'service-account-123' }
      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token client_id is not in the list of authorized Cognito client IDs')
    })

    test('should reject token with unauthorized client_id', async () => {
      const payload = { typ: 'JWT', sub: 'service-account-123', client_id: 'unauthorized-client' }
      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token client_id is not in the list of authorized Cognito client IDs')
    })

    // Configuration edge cases — clientIds is read inside the function so mock can be changed inline
    test('should reject token when no client IDs are configured', async () => {
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return []
          default: return null
        }
      })

      const validateFunc = getCognitoAuthOptions().validate
      const result = await validateFunc(
        { decoded: { payload: { typ: 'JWT', sub: 'svc', client_id: 'client-1' } } },
        mockRequest,
        {}
      )

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized Cognito client IDs configured')
    })

    test('should reject token when clientIds config is null', async () => {
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return null
          default: return null
        }
      })

      const validateFunc = getCognitoAuthOptions().validate
      const result = await validateFunc(
        { decoded: { payload: { typ: 'JWT', sub: 'svc', client_id: 'client-1' } } },
        mockRequest,
        {}
      )

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized Cognito client IDs configured')
    })
  })

  describe('build auth failure log configuration', () => {
    let validateFunction
    let mockRequest

    beforeEach(() => {
      validateFunction = getCognitoAuthOptions().validate
      mockRequest = {
        path: '/test',
        method: 'GET',
        info: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' }
      }
    })

    test('should call buildAuthFailureLog with request context when token type is invalid', async () => {
      const payload = { typ: 'id_token', sub: 'svc', client_id: 'client-1', iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId' }
      await validateFunction({ decoded: { payload } }, mockRequest, {})

      expect(mockBuildAuthFailureLog).toHaveBeenCalledOnce()
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'Provided token is not an access token',
        mockRequest,
        { tokenType: 'id_token', issuer: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId', strategy: 'cognito' }
      )
    })

    test('should call buildAuthFailureLog with request context when client_id is unauthorized', async () => {
      const payload = { typ: 'JWT', sub: 'svc', client_id: 'unauthorized-client', iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId' }
      await validateFunction({ decoded: { payload } }, mockRequest, {})

      expect(mockBuildAuthFailureLog).toHaveBeenCalledOnce()
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'Token client_id is not in the list of authorized Cognito client IDs',
        mockRequest,
        { clientId: 'unauthorized-client', issuer: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId', strategy: 'cognito' }
      )
    })

    test('should call buildAuthFailureLog with request context when no client IDs are configured', async () => {
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return []
          default: return null
        }
      })

      const validateFunc = getCognitoAuthOptions().validate
      await validateFunc(
        { decoded: { payload: { typ: 'JWT', sub: 'svc', client_id: 'client-1' } } },
        mockRequest,
        {}
      )

      expect(mockBuildAuthFailureLog).toHaveBeenCalledOnce()
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'No authorized Cognito client IDs configured',
        mockRequest,
        { strategy: 'cognito' }
      )
    })

    test('should not call buildAuthFailureLog when token is valid', async () => {
      const payload = { typ: 'JWT', sub: 'svc', client_id: 'client-1' }
      await validateFunction({ decoded: { payload } }, mockRequest, {})

      expect(mockBuildAuthFailureLog).not.toHaveBeenCalled()
    })
  })
})
