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

const COGNITO_ISSUER = 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId'

describe('getCognitoAuthProvider', () => {
  let getCognitoAuthProvider
  let createAuthStrategy

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
    getCognitoAuthProvider = module.getCognitoAuthProvider
    const factory = await import('../../../../src/plugins/auth/create-auth-strategy.js')
    createAuthStrategy = factory.createAuthStrategy
  })

  // Provider descriptor shape — JWKS endpoint, region derivation, issuer
  describe('provider descriptor shape', () => {
    test('should be named cognito', () => {
      expect(getCognitoAuthProvider().name).toBe('cognito')
    })

    test('should build JWKS URI from user pool ID and derived region', () => {
      const provider = getCognitoAuthProvider()
      expect(provider.jwksUris).toEqual([`${COGNITO_ISSUER}/.well-known/jwks.json`])
    })

    test('should set issuer from derived region and user pool ID', () => {
      expect(getCognitoAuthProvider().issuers).toEqual([COGNITO_ISSUER])
    })

    test('should surface the issuer and verify settings through the composed strategy', () => {
      const options = createAuthStrategy([getCognitoAuthProvider()])
      expect(options.verify.iss).toEqual([COGNITO_ISSUER])
      expect(options.verify).toMatchObject({ aud: false, sub: false, nbf: true, exp: true })
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

      const { getCognitoAuthProvider: freshProvider } = await import('../../../../src/plugins/auth/cognito-options.js')
      const provider = freshProvider()
      expect(provider.jwksUris).toEqual(['https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCdEfGhI/.well-known/jwks.json'])
      expect(provider.issuers).toEqual(['https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCdEfGhI'])
    })
  })

  // Token validation — acceptance and rejection logic, driven through the real strategy factory
  describe('validate function', () => {
    let cognitoValidateFunction
    let mockRequest

    beforeEach(() => {
      cognitoValidateFunction = createAuthStrategy([getCognitoAuthProvider()]).validate
      mockRequest = {
        path: '/test',
        method: 'GET',
        info: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' }
      }
    })

    const validate = (payload) => cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})

    // Valid token acceptance
    test('should return valid result for valid JWT token with allowed client_id', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'service-account-123',
        client_id: 'client-1',
        iss: COGNITO_ISSUER
      }
      const result = await validate(payload)
      expect(result.isValid).toBe(true)
      expect(result.credentials).toEqual({ token: payload, principalId: 'service-account-123', provider: 'cognito' })
    })

    test('should accept token when client_id matches one of multiple allowed IDs', async () => {
      const payload = { typ: 'JWT', sub: 'service-account-123', client_id: 'client-2', iss: COGNITO_ISSUER }
      const result = await validate(payload)
      expect(result.isValid).toBe(true)
      expect(result.credentials.principalId).toBe('service-account-123')
    })

    // Invalid token rejection
    test('should reject token with missing client_id', async () => {
      const payload = { typ: 'JWT', sub: 'service-account-123', iss: COGNITO_ISSUER }
      const result = await validate(payload)
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token client_id is not in the list of authorized Cognito client IDs')
    })

    test('should reject token with unauthorized client_id', async () => {
      const payload = { typ: 'JWT', sub: 'service-account-123', client_id: 'unauthorized-client', iss: COGNITO_ISSUER }
      const result = await validate(payload)
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token client_id is not in the list of authorized Cognito client IDs')
    })

    test('should log the cognito provider name when a token is refused', async () => {
      const payload = { typ: 'JWT', sub: 'service-account-123', client_id: 'unauthorized-client', iss: COGNITO_ISSUER }
      await validate(payload)
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'Token client_id is not in the list of authorized Cognito client IDs',
        mockRequest,
        expect.objectContaining({ strategy: 'cognito', clientId: 'unauthorized-client' })
      )
    })

    test('should reject when no client IDs are configured', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return []
          default: return null
        }
      })

      const { getCognitoAuthProvider: freshProvider } = await import('../../../../src/plugins/auth/cognito-options.js')
      const { createAuthStrategy: freshFactory } = await import('../../../../src/plugins/auth/create-auth-strategy.js')
      const validateFn = freshFactory([freshProvider()]).validate

      const payload = { typ: 'JWT', sub: 'service-account-123', client_id: 'client-1', iss: COGNITO_ISSUER }
      const result = await validateFn({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized Cognito client IDs configured')
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

      const { getCognitoAuthProvider: freshProvider } = await import('../../../../src/plugins/auth/cognito-options.js')
      expect(() => freshProvider()).toThrow('AUTH_COGNITO_USER_POOL_ID is required when Cognito authentication is enabled')
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

      const { getCognitoAuthProvider: freshProvider } = await import('../../../../src/plugins/auth/cognito-options.js')
      expect(() => freshProvider()).toThrow('AUTH_COGNITO_USER_POOL_ID is required when Cognito authentication is enabled')
    })
  })
})
