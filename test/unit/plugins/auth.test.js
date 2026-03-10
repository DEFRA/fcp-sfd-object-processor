import { expect, test, describe, beforeEach, vi } from 'vitest'

const mockConfigGet = vi.fn()
vi.mock('../../../src/config/index.js', () => ({
  config: {
    get: mockConfigGet
  }
}))

vi.mock('../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

describe('auth plugin', () => {
  let mockServer
  let auth

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    mockServer = {
      auth: {
        strategy: vi.fn(),
        default: vi.fn()
      },
      ext: vi.fn()
    }

    mockConfigGet.mockImplementation((key) => {
      switch (key) {
        case 'auth.entra.enabled':
          return true
        case 'auth.entra.tenant':
          return 'test-tenant-id'
        case 'auth.entra.allowedGroupIds':
          return ['group-1', 'group-2']
        default:
          return null
      }
    })

    const authModule = await import('../../../src/plugins/auth.js')
    auth = authModule.auth
  })

  test('should have a name', () => {
    expect(auth.plugin.name).toBe('auth')
  })

  test('should have a register function', () => {
    expect(auth.plugin.register).toBeInstanceOf(Function)
  })

  describe('register function', () => {
    test('should register auth strategy when auth is enabled', async () => {
      await auth.plugin.register(mockServer)

      expect(mockServer.auth.strategy).toHaveBeenCalledWith(
        'entra',
        'jwt',
        expect.objectContaining({
          keys: expect.objectContaining({
            uri: 'https://login.microsoftonline.com/test-tenant-id/discovery/v2.0/keys'
          }),
          verify: expect.objectContaining({
            aud: false,
            sub: false,
            iss: ['https://sts.windows.net/test-tenant-id/', 'https://login.microsoftonline.com/test-tenant-id/v2.0'],
            nbf: true,
            exp: true
          }),
          validate: expect.any(Function)
        })
      )
    })

    test('should set default auth strategy when auth is enabled', async () => {
      await auth.plugin.register(mockServer)

      expect(mockServer.auth.default).toHaveBeenCalledWith('entra')
    })

    test('should not register auth strategy when auth is disabled', async () => {
      mockConfigGet.mockImplementation((key) => {
        if (key === 'auth.entra.enabled') return false
        return null
      })

      await auth.plugin.register(mockServer)

      expect(mockServer.auth.strategy).not.toHaveBeenCalled()
      expect(mockServer.auth.default).not.toHaveBeenCalled()
      expect(mockServer.ext).not.toHaveBeenCalled()
    })

    test('should use correct JWKS URI with tenant ID', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled':
            return true
          case 'auth.entra.tenant':
            return 'my-custom-tenant'
          case 'auth.entra.allowedGroupIds':
            return ['group-1']
          default:
            return null
        }
      })

      const { auth: authWithCustomTenant } = await import('../../../src/plugins/auth.js')
      const newMockServer = {
        auth: {
          strategy: vi.fn(),
          default: vi.fn()
        },
        ext: vi.fn()
      }

      await authWithCustomTenant.plugin.register(newMockServer)

      const authOptions = newMockServer.auth.strategy.mock.calls[0][2]
      expect(authOptions.keys.uri).toBe('https://login.microsoftonline.com/my-custom-tenant/discovery/v2.0/keys')
    })

    test('should accept both v1.0 and v2.0 token issuers', async () => {
      await auth.plugin.register(mockServer)

      const authOptions = mockServer.auth.strategy.mock.calls[0][2]
      expect(authOptions.verify.iss).toEqual([
        'https://sts.windows.net/test-tenant-id/',
        'https://login.microsoftonline.com/test-tenant-id/v2.0'
      ])
    })

    test('should register onPreResponse extension when auth is enabled', async () => {
      await auth.plugin.register(mockServer)

      expect(mockServer.ext).toHaveBeenCalledWith('onPreResponse', expect.any(Function))
    })

    test('should call h.continue in onPreResponse for non-401 responses', async () => {
      await auth.plugin.register(mockServer)

      const extensionHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: {
          isBoom: true,
          output: { statusCode: 403 }
        },
        path: '/test',
        method: 'GET',
        info: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
      const mockH = { continue: Symbol('continue') }

      const result = extensionHandler(mockRequest, mockH)

      expect(result).toBe(mockH.continue)
    })

    test('should call h.continue in onPreResponse for 401 responses', async () => {
      await auth.plugin.register(mockServer)

      const extensionHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: {
          isBoom: true,
          output: {
            statusCode: 401,
            payload: { message: 'Unauthorized' }
          },
          message: 'Invalid token'
        },
        path: '/test',
        method: 'GET',
        info: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' }
      }
      const mockH = { continue: Symbol('continue') }

      const result = extensionHandler(mockRequest, mockH)

      expect(result).toBe(mockH.continue)
    })
  })

  describe('validate function', () => {
    let validateFunction
    let mockRequest
    let mockH

    beforeEach(async () => {
      await auth.plugin.register(mockServer)
      validateFunction = mockServer.auth.strategy.mock.calls[0][2].validate
      mockRequest = {
        path: '/test',
        method: 'GET',
        info: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' }
      }
      mockH = {}
    })

    test('should return valid result for valid JWT token with allowed groups', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'user-123',
        groups: ['group-1', 'group-3']
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunction(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(true)
      expect(result.credentials).toEqual({
        token: payload,
        principalId: 'user-123'
      })
    })

    test('should return valid result for at+jwt token type', async () => {
      const payload = {
        typ: 'at+jwt',
        sub: 'user-123',
        groups: ['group-1']
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunction(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(true)
    })

    test('should reject token with invalid type', async () => {
      const payload = {
        typ: 'refresh',
        sub: 'user-123',
        groups: ['group-1']
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunction(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Provided token is not an access token')
    })

    test('should reject token when no allowed groups are configured', async () => {
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled':
            return true
          case 'auth.entra.tenant':
            return 'test-tenant-id'
          case 'auth.entra.allowedGroupIds':
            return []
          default:
            return null
        }
      })

      vi.resetModules()
      const { auth: authWithEmptyGroups } = await import('../../../src/plugins/auth.js')
      await authWithEmptyGroups.plugin.register(mockServer)
      const validateFunc = mockServer.auth.strategy.mock.calls[1][2].validate

      const payload = {
        typ: 'JWT',
        sub: 'user-123',
        groups: ['group-1']
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunc(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized security groups configured')
    })

    test('should reject token without matching security groups', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'user-123',
        groups: ['group-3', 'group-4']
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunction(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    test('should reject token without groups claim', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'user-123'
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunction(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    test('should reject token when groups claim is not an array', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'user-123',
        groups: 'not-an-array'
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunction(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })

    test('should accept token with one matching group among many', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'user-123',
        groups: ['group-3', 'group-2', 'group-4']
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunction(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(true)
      expect(result.credentials.principalId).toBe('user-123')
    })

    test('should accept token without typ claim', async () => {
      const payload = {
        sub: 'user-123',
        groups: ['group-1']
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunction(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(true)
    })

    test('should preserve all token payload in credentials', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'user-123',
        groups: ['group-1'],
        name: 'Test User',
        email: 'test@example.com',
        custom_claim: 'custom_value'
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunction(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(true)
      expect(result.credentials.token).toEqual(payload)
      expect(result.credentials.token.name).toBe('Test User')
      expect(result.credentials.token.email).toBe('test@example.com')
      expect(result.credentials.token.custom_claim).toBe('custom_value')
    })

    test('should reject token with empty groups array', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'user-123',
        groups: []
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunction(artifacts, mockRequest, mockH)

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token does not belong to an authorized Security Group')
    })
  })

  describe('configuration scenarios', () => {
    const mockRequest = {
      path: '/test',
      method: 'GET',
      info: { remoteAddress: '127.0.0.1' },
      headers: { 'user-agent': 'test-agent' }
    }

    test('should reject token when allowedGroupIds config is null', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled':
            return true
          case 'auth.entra.tenant':
            return 'test-tenant-id'
          case 'auth.entra.allowedGroupIds':
            return null
          default:
            return null
        }
      })

      const { auth: authWithNullGroups } = await import('../../../src/plugins/auth.js')
      const newMockServer = {
        auth: {
          strategy: vi.fn(),
          default: vi.fn()
        },
        ext: vi.fn()
      }

      await authWithNullGroups.plugin.register(newMockServer)
      const validateFunc = newMockServer.auth.strategy.mock.calls[0][2].validate

      const payload = {
        typ: 'JWT',
        sub: 'user-123',
        groups: ['some-group']
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunc(artifacts, mockRequest, {})

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized security groups configured')
    })

    test('should reject token when allowedGroupIds config is undefined', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled':
            return true
          case 'auth.entra.tenant':
            return 'test-tenant-id'
          case 'auth.entra.allowedGroupIds':
            return undefined
          default:
            return null
        }
      })

      const { auth: authWithUndefinedGroups } = await import('../../../src/plugins/auth.js')
      const newMockServer = {
        auth: {
          strategy: vi.fn(),
          default: vi.fn()
        },
        ext: vi.fn()
      }

      await authWithUndefinedGroups.plugin.register(newMockServer)
      const validateFunc = newMockServer.auth.strategy.mock.calls[0][2].validate

      const payload = {
        typ: 'JWT',
        sub: 'user-123',
        groups: ['some-group']
      }

      const artifacts = {
        decoded: { payload }
      }

      const result = await validateFunc(artifacts, mockRequest, {})

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized security groups configured')
    })
  })
})

describe('cognito auth plugin', () => {
  let mockServer
  let auth

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    mockServer = {
      auth: {
        strategy: vi.fn(),
        default: vi.fn()
      },
      ext: vi.fn()
    }

    mockConfigGet.mockImplementation((key) => {
      switch (key) {
        case 'auth.entra.enabled':
          return false
        case 'auth.cognito.enabled':
          return true
        case 'auth.cognito.userPoolId':
          return 'eu-west-2_testPoolId'
        case 'auth.cognito.clientIds':
          return ['client-1', 'client-2']
        default:
          return null
      }
    })

    const authModule = await import('../../../src/plugins/auth.js')
    auth = authModule.auth
  })

  describe('register function', () => {
    test('should register cognito strategy when cognito is enabled', async () => {
      await auth.plugin.register(mockServer)

      expect(mockServer.auth.strategy).toHaveBeenCalledWith(
        'cognito',
        'jwt',
        expect.objectContaining({
          keys: expect.objectContaining({
            uri: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId/.well-known/jwks.json'
          }),
          verify: expect.objectContaining({
            aud: false,
            sub: false,
            iss: ['https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId'],
            nbf: true,
            exp: true
          }),
          validate: expect.any(Function)
        })
      )
    })

    test('should set default to cognito strategy when only cognito is enabled', async () => {
      await auth.plugin.register(mockServer)

      expect(mockServer.auth.default).toHaveBeenCalledWith('cognito')
    })

    test('should register onPreResponse extension when cognito is enabled', async () => {
      await auth.plugin.register(mockServer)

      expect(mockServer.ext).toHaveBeenCalledWith('onPreResponse', expect.any(Function))
    })

    test('should derive region and issuer correctly from user pool ID', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled': return false
          case 'auth.cognito.enabled': return true
          case 'auth.cognito.userPoolId': return 'us-east-1_AbCdEfGhI'
          case 'auth.cognito.clientIds': return ['abc123']
          default: return null
        }
      })

      const { auth: authWithDifferentRegion } = await import('../../../src/plugins/auth.js')
      const newMockServer = { auth: { strategy: vi.fn(), default: vi.fn() }, ext: vi.fn() }

      await authWithDifferentRegion.plugin.register(newMockServer)

      const authOptions = newMockServer.auth.strategy.mock.calls[0][2]
      expect(authOptions.keys.uri).toBe('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCdEfGhI/.well-known/jwks.json')
      expect(authOptions.verify.iss).toEqual(['https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCdEfGhI'])
    })
  })

  describe('dual-auth configuration', () => {
    test('should set default to both strategies when entra and cognito are both enabled', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled': return true
          case 'auth.entra.tenant': return 'test-tenant-id'
          case 'auth.entra.allowedGroupIds': return ['group-1']
          case 'auth.cognito.enabled': return true
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return ['client-1']
          default: return null
        }
      })

      const { auth: dualAuth } = await import('../../../src/plugins/auth.js')
      const newMockServer = { auth: { strategy: vi.fn(), default: vi.fn() }, ext: vi.fn() }

      await dualAuth.plugin.register(newMockServer)

      expect(newMockServer.auth.strategy).toHaveBeenCalledWith('entra', 'jwt', expect.any(Object))
      expect(newMockServer.auth.strategy).toHaveBeenCalledWith('cognito', 'jwt', expect.any(Object))
      expect(newMockServer.auth.default).toHaveBeenCalledWith({ strategies: ['entra', 'cognito'] })
    })

    test('should register strategies in order entra then cognito', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled': return true
          case 'auth.entra.tenant': return 'test-tenant-id'
          case 'auth.entra.allowedGroupIds': return ['group-1']
          case 'auth.cognito.enabled': return true
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return ['client-1']
          default: return null
        }
      })

      const { auth: dualAuth } = await import('../../../src/plugins/auth.js')
      const callOrder = []
      const newMockServer = {
        auth: {
          strategy: vi.fn().mockImplementation((name) => callOrder.push(`strategy:${name}`)),
          default: vi.fn().mockImplementation(() => callOrder.push('default'))
        },
        ext: vi.fn()
      }

      await dualAuth.plugin.register(newMockServer)

      expect(callOrder).toEqual(['strategy:entra', 'strategy:cognito', 'default'])
    })

    test('should not register any strategies when both are disabled', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        if (key === 'auth.entra.enabled') return false
        if (key === 'auth.cognito.enabled') return false
        return null
      })

      const { auth: noAuth } = await import('../../../src/plugins/auth.js')
      const newMockServer = { auth: { strategy: vi.fn(), default: vi.fn() }, ext: vi.fn() }

      await noAuth.plugin.register(newMockServer)

      expect(newMockServer.auth.strategy).not.toHaveBeenCalled()
      expect(newMockServer.auth.default).not.toHaveBeenCalled()
      expect(newMockServer.ext).not.toHaveBeenCalled()
    })
  })

  describe('cognito validate function', () => {
    let cognitoValidateFunction
    let mockRequest

    beforeEach(async () => {
      await auth.plugin.register(mockServer)
      cognitoValidateFunction = mockServer.auth.strategy.mock.calls[0][2].validate
      mockRequest = {
        path: '/test',
        method: 'GET',
        info: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' }
      }
    })

    test('should return valid result for valid JWT token with allowed client_id', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'service-account-123',
        client_id: 'client-1',
        iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId'
      }

      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(true)
      expect(result.credentials).toEqual({
        token: payload,
        principalId: 'service-account-123'
      })
    })

    test('should return valid result for at+jwt token type', async () => {
      const payload = {
        typ: 'at+jwt',
        sub: 'service-account-123',
        client_id: 'client-2'
      }

      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(true)
    })

    test('should accept token without typ claim', async () => {
      const payload = {
        sub: 'service-account-123',
        client_id: 'client-1'
      }

      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(true)
    })

    test('should accept token when client_id matches one of multiple allowed IDs', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'service-account-123',
        client_id: 'client-2'
      }

      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(true)
      expect(result.credentials.principalId).toBe('service-account-123')
    })

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
      const payload = {
        typ: 'JWT',
        sub: 'service-account-123'
      }

      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token client_id is not in the list of authorized Cognito client IDs')
    })

    test('should reject token with unauthorized client_id', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'service-account-123',
        client_id: 'unauthorized-client'
      }

      const result = await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token client_id is not in the list of authorized Cognito client IDs')
    })

    test('should reject token when no client IDs are configured', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled': return false
          case 'auth.cognito.enabled': return true
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return []
          default: return null
        }
      })

      const { auth: authWithNoClients } = await import('../../../src/plugins/auth.js')
      const newMockServer = { auth: { strategy: vi.fn(), default: vi.fn() }, ext: vi.fn() }

      await authWithNoClients.plugin.register(newMockServer)
      const validateFunc = newMockServer.auth.strategy.mock.calls[0][2].validate

      const result = await validateFunc(
        { decoded: { payload: { typ: 'JWT', sub: 'svc', client_id: 'client-1' } } },
        mockRequest,
        {}
      )

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized Cognito client IDs configured')
    })

    test('should reject token when clientIds config is null', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled': return false
          case 'auth.cognito.enabled': return true
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return null
          default: return null
        }
      })

      const { auth: authWithNullClients } = await import('../../../src/plugins/auth.js')
      const newMockServer = { auth: { strategy: vi.fn(), default: vi.fn() }, ext: vi.fn() }

      await authWithNullClients.plugin.register(newMockServer)
      const validateFunc = newMockServer.auth.strategy.mock.calls[0][2].validate

      const result = await validateFunc(
        { decoded: { payload: { typ: 'JWT', sub: 'svc', client_id: 'client-1' } } },
        mockRequest,
        {}
      )

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized Cognito client IDs configured')
    })

    test('should preserve all token payload in credentials', async () => {
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
  })

  describe('cognito logging', () => {
    let cognitoValidateFunction
    let mockLogger
    let mockRequest

    beforeEach(async () => {
      const { createLogger } = await import('../../../src/logging/logger.js')
      mockLogger = createLogger()

      await auth.plugin.register(mockServer)
      cognitoValidateFunction = mockServer.auth.strategy.mock.calls[0][2].validate
      mockRequest = {
        path: '/api/v1/test',
        method: 'POST',
        info: { remoteAddress: '10.0.0.1' },
        headers: { 'user-agent': 'test-agent' }
      }
    })

    test('should log warning when token type is invalid', async () => {
      const payload = {
        typ: 'id_token',
        sub: 'svc',
        client_id: 'client-1',
        iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId'
      }

      await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Authentication failed',
          reason: 'Provided token is not an access token',
          strategy: 'cognito',
          tokenType: 'id_token',
          path: '/api/v1/test',
          method: 'POST',
          sourceIp: '10.0.0.1'
        })
      )
    })

    test('should log warning when client_id is unauthorized', async () => {
      const payload = {
        typ: 'JWT',
        sub: 'svc',
        client_id: 'bad-client',
        iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId'
      }

      await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Authentication failed',
          reason: 'Token client_id is not in the list of authorized Cognito client IDs',
          strategy: 'cognito',
          clientId: 'bad-client',
          path: '/api/v1/test',
          method: 'POST',
          sourceIp: '10.0.0.1'
        })
      )
    })

    test('should log issuer in token type and client_id failure logs', async () => {
      const issuer = 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_testPoolId'
      const payload = {
        typ: 'id_token',
        sub: 'svc',
        client_id: 'client-1',
        iss: issuer
      }

      await cognitoValidateFunction({ decoded: { payload } }, mockRequest, {})

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          issuer
        })
      )
    })

    test('should log warning when no client IDs are configured', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled': return false
          case 'auth.cognito.enabled': return true
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return []
          default: return null
        }
      })

      const { createLogger } = await import('../../../src/logging/logger.js')
      const freshLogger = createLogger()

      const { auth: authWithNoClients } = await import('../../../src/plugins/auth.js')
      const newMockServer = { auth: { strategy: vi.fn(), default: vi.fn() }, ext: vi.fn() }

      await authWithNoClients.plugin.register(newMockServer)
      const validateFunc = newMockServer.auth.strategy.mock.calls[0][2].validate

      await validateFunc(
        { decoded: { payload: { typ: 'JWT', sub: 'svc', client_id: 'client-1' } } },
        mockRequest,
        {}
      )

      expect(freshLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Authentication failed',
          reason: 'No authorized Cognito client IDs configured',
          strategy: 'cognito'
        })
      )
    })
  })
})
