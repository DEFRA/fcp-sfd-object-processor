import { expect, test, describe, beforeEach, vi } from 'vitest'

const mockConfigGet = vi.fn()
vi.mock('../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}
vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue(mockLogger)
}))

describe('getEntraAuthOptions', () => {
  let getEntraAuthOptions

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    mockConfigGet.mockImplementation((key) => {
      switch (key) {
        case 'auth.entra.tenant': return 'test-tenant-id'
        case 'auth.entra.allowedGroupIds': return ['group-1', 'group-2']
        default: return null
      }
    })

    const module = await import('../../../../src/plugins/auth/entra-options.js')
    getEntraAuthOptions = module.getEntraAuthOptions
  })

  // Options shape — JWKS endpoint, issuer config, verify settings
  describe('options shape', () => {
    test('should build JWKS keys URI using configured tenant ID', () => {
      const options = getEntraAuthOptions()
      expect(options.keys.uri).toBe('https://login.microsoftonline.com/test-tenant-id/discovery/v2.0/keys')
    })

    test('should accept both v1.0 and v2.0 token issuers', () => {
      const options = getEntraAuthOptions()
      expect(options.verify.iss).toEqual([
        'https://sts.windows.net/test-tenant-id/',
        'https://login.microsoftonline.com/test-tenant-id/v2.0'
      ])
    })

    test('should configure verify options with aud and sub disabled', () => {
      const options = getEntraAuthOptions()
      expect(options.verify).toMatchObject({ aud: false, sub: false, nbf: true, exp: true })
    })

    test('should expose a validate function', () => {
      const options = getEntraAuthOptions()
      expect(options.validate).toBeInstanceOf(Function)
    })

    test('should build correct JWKS URI for a different tenant ID', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.tenant': return 'my-custom-tenant'
          case 'auth.entra.allowedGroupIds': return ['group-1']
          default: return null
        }
      })

      const { getEntraAuthOptions: freshOptions } = await import('../../../../src/plugins/auth/entra-options.js')
      const options = freshOptions()
      expect(options.keys.uri).toBe('https://login.microsoftonline.com/my-custom-tenant/discovery/v2.0/keys')
    })
  })

  // Token validation — acceptance and rejection logic
  describe('validate function', () => {
    let validateFunction
    let mockRequest

    beforeEach(() => {
      validateFunction = getEntraAuthOptions().validate
      mockRequest = {
        path: '/test',
        method: 'GET',
        info: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' }
      }
    })

    // Valid token acceptance
    test('should return valid result for valid JWT token with allowed groups', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', groups: ['group-1', 'group-3'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
      expect(result.credentials).toEqual({ token: payload, principalId: 'user-123' })
    })

    test('should return valid result for at+jwt token type', async () => {
      const payload = { typ: 'at+jwt', sub: 'user-123', groups: ['group-1'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
    })

    test('should accept token without typ claim', async () => {
      const payload = { sub: 'user-123', groups: ['group-1'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
    })

    test('should accept token with one matching group among many', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', groups: ['group-3', 'group-2', 'group-4'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
      expect(result.credentials.principalId).toBe('user-123')
    })

    test('should preserve all token payload fields in credentials', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'user-123',
        groups: ['group-1'],
        name: 'Test User',
        email: 'test@example.com',
        custom_claim: 'custom_value'
      }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
      expect(result.credentials.token).toEqual(payload)
      expect(result.credentials.token.name).toBe('Test User')
      expect(result.credentials.token.email).toBe('test@example.com')
      expect(result.credentials.token.custom_claim).toBe('custom_value')
    })

    // Invalid token rejection
    test('should reject token with invalid type', async () => {
      const payload = { typ: 'refresh', sub: 'user-123', groups: ['group-1'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Provided token is not an access token')
    })

    test('should reject token without matching security groups', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', groups: ['group-3', 'group-4'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    test('should reject token without groups claim', async () => {
      const payload = { typ: 'JWT', sub: 'user-123' }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    test('should reject token when groups claim is not an array', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', groups: 'not-an-array' }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    test('should reject token with empty groups array', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', groups: [] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })
  })

  // Configuration edge cases — null/empty/undefined allowedGroupIds
  // Note: allowedGroupIds is read at module level, so vi.resetModules() + re-import is required
  // to test different config values
  describe('configuration scenarios', () => {
    const mockRequest = {
      path: '/test',
      method: 'GET',
      info: { remoteAddress: '127.0.0.1' },
      headers: { 'user-agent': 'test-agent' }
    }

    test('should reject token when allowedGroupIds config is an empty array', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.tenant': return 'test-tenant-id'
          case 'auth.entra.allowedGroupIds': return []
          default: return null
        }
      })

      const { getEntraAuthOptions: freshOptions } = await import('../../../../src/plugins/auth/entra-options.js')
      const validateFunc = freshOptions().validate
      const payload = { typ: 'JWT', sub: 'user-123', groups: ['group-1'] }
      const result = await validateFunc({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized security groups configured')
    })

    test('should reject token when allowedGroupIds config is null', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.tenant': return 'test-tenant-id'
          case 'auth.entra.allowedGroupIds': return null
          default: return null
        }
      })

      const { getEntraAuthOptions: freshOptions } = await import('../../../../src/plugins/auth/entra-options.js')
      const validateFunc = freshOptions().validate
      const payload = { typ: 'JWT', sub: 'user-123', groups: ['some-group'] }
      const result = await validateFunc({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized security groups configured')
    })

    test('should reject token when allowedGroupIds config is undefined', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.tenant': return 'test-tenant-id'
          case 'auth.entra.allowedGroupIds': return undefined
          default: return null
        }
      })

      const { getEntraAuthOptions: freshOptions } = await import('../../../../src/plugins/auth/entra-options.js')
      const validateFunc = freshOptions().validate
      const payload = { typ: 'JWT', sub: 'user-123', groups: ['some-group'] }
      const result = await validateFunc({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized security groups configured')
    })
  })
})
