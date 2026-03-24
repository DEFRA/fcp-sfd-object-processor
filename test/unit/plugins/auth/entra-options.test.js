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

const mockBuildAuthFailureLog = vi.fn()
vi.mock('../../../../src/utils/build-auth-failure-log.js', () => ({
  buildAuthFailureLog: mockBuildAuthFailureLog
}))

describe('getEntraAuthOptions', () => {
  let getEntraAuthOptions

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const module = await import('../../../../src/plugins/auth/entra-options.js')
    getEntraAuthOptions = module.getEntraAuthOptions
  })

  // Options shape — JWKS endpoint, issuer config, verify settings
  describe('options shape', () => {
    test('should build JWKS keys URI using configured tenant ID', () => {
      const options = getEntraAuthOptions({ tenantId: 'test-tenant-id', allowedGroupIds: ['group-1', 'group-2'] })
      expect(options.keys.uri).toBe('https://login.microsoftonline.com/test-tenant-id/discovery/v2.0/keys')
    })

    test('should accept both v1.0 and v2.0 token issuers', () => {
      const options = getEntraAuthOptions({ tenantId: 'test-tenant-id', allowedGroupIds: ['group-1'] })
      expect(options.verify.iss).toEqual([
        'https://sts.windows.net/test-tenant-id/',
        'https://login.microsoftonline.com/test-tenant-id/v2.0'
      ])
    })

    test('should configure verify options with aud and sub disabled', () => {
      const options = getEntraAuthOptions({ tenantId: 'test-tenant-id', allowedGroupIds: ['group-1'] })
      expect(options.verify).toMatchObject({ aud: false, sub: false, nbf: true, exp: true })
    })

    test('should expose a validate function', () => {
      const options = getEntraAuthOptions({ tenantId: 'test-tenant-id', allowedGroupIds: ['group-1'] })
      expect(options.validate).toBeInstanceOf(Function)
    })

    test('should build correct JWKS URI for a different tenant ID', async () => {
      vi.resetModules()
      const { getEntraAuthOptions: freshOptions } = await import('../../../../src/plugins/auth/entra-options.js')
      const options = freshOptions({ tenantId: 'my-custom-tenant', allowedGroupIds: ['group-1'] })
      expect(options.keys.uri).toBe('https://login.microsoftonline.com/my-custom-tenant/discovery/v2.0/keys')
    })
  })

  // Token validation — acceptance and rejection logic
  describe('validate function', () => {
    let validateFunction
    let mockRequest

    beforeEach(() => {
      validateFunction = getEntraAuthOptions({ tenantId: 'test-tenant-id', allowedGroupIds: ['group-1', 'group-2'] }).validate
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

    test('should accept token with one matching group among many', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', groups: ['group-3', 'group-2', 'group-4'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
      expect(result.credentials.principalId).toBe('user-123')
    })

    // Invalid token rejection
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
})
