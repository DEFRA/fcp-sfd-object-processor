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

const TENANT_A = { tenantId: 'tenant-a-id', allowedGroupIds: ['group-1', 'group-2'] }
const TENANT_B = { tenantId: 'tenant-b-id', allowedGroupIds: ['group-9'] }

const issuerV1For = (tenantId) => `https://sts.windows.net/${tenantId}/`
const issuerV2For = (tenantId) => `https://login.microsoftonline.com/${tenantId}/v2.0`

describe('getEntraAuthOptions', () => {
  let getEntraAuthOptions

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const module = await import('../../../../src/plugins/auth/entra-options.js')
    getEntraAuthOptions = module.getEntraAuthOptions
  })

  // Options shape — JWKS endpoints, issuer config, verify settings
  describe('options shape', () => {
    test('should build one JWKS keys URI per configured tenant', () => {
      const options = getEntraAuthOptions([TENANT_A, TENANT_B])
      expect(options.keys).toEqual([
        { uri: 'https://login.microsoftonline.com/tenant-a-id/discovery/v2.0/keys' },
        { uri: 'https://login.microsoftonline.com/tenant-b-id/discovery/v2.0/keys' }
      ])
    })

    test('should build a single-element keys array for a single tenant', () => {
      const options = getEntraAuthOptions([TENANT_A])
      expect(options.keys).toEqual([
        { uri: 'https://login.microsoftonline.com/tenant-a-id/discovery/v2.0/keys' }
      ])
    })

    test('should accept both v1.0 and v2.0 token issuers for every configured tenant', () => {
      const options = getEntraAuthOptions([TENANT_A, TENANT_B])
      expect(options.verify.iss).toEqual([
        issuerV1For('tenant-a-id'),
        issuerV2For('tenant-a-id'),
        issuerV1For('tenant-b-id'),
        issuerV2For('tenant-b-id')
      ])
    })

    test('should configure verify options with aud and sub disabled', () => {
      const options = getEntraAuthOptions([TENANT_A])
      expect(options.verify).toMatchObject({ aud: false, sub: false, nbf: true, exp: true })
    })

    test('should expose a validate function', () => {
      const options = getEntraAuthOptions([TENANT_A])
      expect(options.validate).toBeInstanceOf(Function)
    })

    test('should default to no tenants (empty keys/iss) when called without arguments', () => {
      const options = getEntraAuthOptions()
      expect(options.keys).toEqual([])
      expect(options.verify.iss).toEqual([])
    })
  })

  // Token validation — acceptance and rejection logic, resolved per-token via its own `iss`
  describe('validate function', () => {
    let validateFunction
    let mockRequest

    beforeEach(() => {
      validateFunction = getEntraAuthOptions([TENANT_A, TENANT_B]).validate
      mockRequest = {
        path: '/test',
        method: 'GET',
        info: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' }
      }
    })

    // Valid token acceptance
    test('should return valid result for valid JWT token with allowed groups (v1.0 issuer)', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', iss: issuerV1For('tenant-a-id'), groups: ['group-1', 'group-3'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
      expect(result.credentials).toEqual({ token: payload, principalId: 'user-123' })
    })

    test('should return valid result for valid JWT token with allowed groups (v2.0 issuer)', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', iss: issuerV2For('tenant-a-id'), groups: ['group-2'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
    })

    test('should accept token with one matching group among many', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', iss: issuerV1For('tenant-a-id'), groups: ['group-3', 'group-2', 'group-4'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
      expect(result.credentials.principalId).toBe('user-123')
    })

    test('should resolve the allowed groups for the specific tenant the token was issued by', async () => {
      const payload = { typ: 'JWT', sub: 'user-456', iss: issuerV1For('tenant-b-id'), groups: ['group-9'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
    })

    test('should reject a tenant-b token containing only tenant-a groups', async () => {
      const payload = { typ: 'JWT', sub: 'user-456', iss: issuerV1For('tenant-b-id'), groups: ['group-1', 'group-2'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    // Invalid token rejection
    test('should reject token without matching security groups', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', iss: issuerV1For('tenant-a-id'), groups: ['group-3', 'group-4'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    test('should reject token without groups claim', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', iss: issuerV1For('tenant-a-id') }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    test('should reject token when groups claim is not an array', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', iss: issuerV1For('tenant-a-id'), groups: 'not-an-array' }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    test('should reject token with empty groups array', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', iss: issuerV1For('tenant-a-id'), groups: [] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    test('should reject token with invalid token type', async () => {
      const payload = { typ: 'ID', sub: 'user-123', iss: issuerV1For('tenant-a-id'), groups: ['group-1'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Provided token is not an access token')
    })

    test('should reject when allowedGroupIds is empty (empty list message preserved)', async () => {
      const emptyValidate = getEntraAuthOptions([{ tenantId: 'test-tenant-id', allowedGroupIds: [] }]).validate
      const payload = { typ: 'JWT', sub: 'user-123', iss: issuerV1For('test-tenant-id'), groups: ['group-1'] }
      const result = await emptyValidate({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized security groups configured')
    })

    test('should reject a token whose issuer does not match any configured tenant (empty list message)', async () => {
      const payload = { typ: 'JWT', sub: 'user-unknown', iss: 'https://sts.windows.net/unknown-tenant/', groups: ['group-1'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized security groups configured')
    })

    test('should reject when called with no tenants configured at all', async () => {
      const validateFn = getEntraAuthOptions().validate
      const payload = { typ: 'JWT', sub: 'user-missing', iss: issuerV1For('tenant-a-id'), groups: ['group-1'] }
      const result = await validateFn({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized security groups configured')
    })
  })
})
