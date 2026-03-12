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

    test('should accept token when client_id matches one of multiple allowed IDs', async () => {
      const payload = { typ: 'JWT', sub: 'service-account-123', client_id: 'client-2' }
      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
      expect(result.credentials.principalId).toBe('service-account-123')
    })

    // Invalid token rejection
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
  })

  // Guard — missing userPoolId
  describe('guard - missing userPoolId', () => {
    test('should throw when userPoolId is an empty string', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.cognito.userPoolId': return ''
          case 'auth.cognito.clientIds': return ['client-1']
          default: return null
        }
      })

      const { getCognitoAuthOptions: freshOptions } = await import('../../../../src/plugins/auth/cognito-options.js')
      expect(() => freshOptions()).toThrow('AUTH_COGNITO_USER_POOL_ID is required when Cognito authentication is enabled')
    })

    test('should throw when userPoolId is null', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.cognito.userPoolId': return null
          case 'auth.cognito.clientIds': return ['client-1']
          default: return null
        }
      })

      const { getCognitoAuthOptions: freshOptions } = await import('../../../../src/plugins/auth/cognito-options.js')
      expect(() => freshOptions()).toThrow('AUTH_COGNITO_USER_POOL_ID is required when Cognito authentication is enabled')
    })
  })
})
