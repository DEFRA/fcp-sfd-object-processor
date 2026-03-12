import { expect, test, describe, beforeEach, vi, afterEach } from 'vitest'

const mockConfigGet = vi.fn()
vi.mock('../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

const mockWarn = vi.fn()
vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: mockWarn,
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

    // Default: entra enabled, cognito disabled
    mockConfigGet.mockImplementation((key) => {
      switch (key) {
        case 'auth.entra.enabled': return true
        case 'auth.entra.tenant': return 'test-tenant-id'
        case 'auth.entra.allowedGroupIds': return ['group-1', 'group-2']
        case 'auth.cognito.enabled': return false
        default: return null
      }
    })

    const authModule = await import('../../../../src/plugins/auth/index.js')
    auth = authModule.auth
  })

  // Plugin metadata
  test('should have a name', () => {
    expect(auth.plugin.name).toBe('auth')
  })

  test('should have a register function', () => {
    expect(auth.plugin.register).toBeInstanceOf(Function)
  })

  // Entra strategy registration
  describe('entra strategy registration', () => {
    test('should register entra strategy when entra is enabled', async () => {
      await auth.plugin.register(mockServer)
      expect(mockServer.auth.strategy).toHaveBeenCalledWith('entra', 'jwt', expect.any(Object))
    })

    test('should set default to entra strategy when only entra is enabled', async () => {
      await auth.plugin.register(mockServer)
      expect(mockServer.auth.default).toHaveBeenCalledWith('entra')
    })

    test('should register onPreResponse extension when entra is enabled', async () => {
      await auth.plugin.register(mockServer)
      expect(mockServer.ext).toHaveBeenCalledWith('onPreResponse', expect.any(Function))
    })

    test('should not register any strategy when entra is disabled', async () => {
      mockConfigGet.mockImplementation((key) => {
        if (key === 'auth.entra.enabled') return false
        if (key === 'auth.cognito.enabled') return false
        return null
      })

      await auth.plugin.register(mockServer)

      expect(mockServer.auth.strategy).not.toHaveBeenCalled()
      expect(mockServer.auth.default).not.toHaveBeenCalled()
      expect(mockServer.ext).not.toHaveBeenCalled()
    })
  })

  // Cognito strategy registration
  describe('cognito strategy registration', () => {
    beforeEach(async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled': return false
          case 'auth.cognito.enabled': return true
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return ['client-1', 'client-2']
          default: return null
        }
      })

      const authModule = await import('../../../../src/plugins/auth/index.js')
      auth = authModule.auth
    })

    test('should register cognito strategy when cognito is enabled', async () => {
      await auth.plugin.register(mockServer)
      expect(mockServer.auth.strategy).toHaveBeenCalledWith('cognito', 'jwt', expect.any(Object))
    })

    test('should set default to cognito strategy when only cognito is enabled', async () => {
      await auth.plugin.register(mockServer)
      expect(mockServer.auth.default).toHaveBeenCalledWith('cognito')
    })

    test('should register onPreResponse extension when cognito is enabled', async () => {
      await auth.plugin.register(mockServer)
      expect(mockServer.ext).toHaveBeenCalledWith('onPreResponse', expect.any(Function))
    })
  })

  // Dual-auth configuration — both strategies enabled simultaneously
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

      const { auth: dualAuth } = await import('../../../../src/plugins/auth/index.js')
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

      const { auth: dualAuth } = await import('../../../../src/plugins/auth/index.js')
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

      const { auth: noAuth } = await import('../../../../src/plugins/auth/index.js')
      const newMockServer = { auth: { strategy: vi.fn(), default: vi.fn() }, ext: vi.fn() }

      await noAuth.plugin.register(newMockServer)

      expect(newMockServer.auth.strategy).not.toHaveBeenCalled()
      expect(newMockServer.auth.default).not.toHaveBeenCalled()
      expect(newMockServer.ext).not.toHaveBeenCalled()
    })
  })

  // onPreResponse lifecycle hook — logs 401 failures and continues for all responses
  describe('onPreResponse extension', () => {
    afterEach(() => {
      mockWarn.mockClear()
    })

    test('should call h.continue for non-401 boom responses', async () => {
      await auth.plugin.register(mockServer)

      const extensionHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: { isBoom: true, output: { statusCode: 403 } },
        path: '/test',
        method: 'GET',
        info: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
      const mockH = { continue: Symbol('continue') }

      const result = extensionHandler(mockRequest, mockH)

      expect(result).toBe(mockH.continue)
    })

    test('should call h.continue for 401 responses', async () => {
      await auth.plugin.register(mockServer)

      const extensionHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: {
          isBoom: true,
          output: { statusCode: 401, payload: { message: 'Unauthorized' } },
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

    test('should log tokenGroups and undefined tokenClientId for an Entra 401', async () => {
      await auth.plugin.register(mockServer)

      const extensionHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: {
          isBoom: true,
          output: { statusCode: 401, payload: { message: 'Unauthorized' } },
          message: 'Invalid token'
        },
        path: '/api/v1/metadata',
        method: 'GET',
        info: { remoteAddress: '10.0.0.1' },
        headers: { 'user-agent': 'test-agent' },
        auth: {
          artifacts: {
            decoded: {
              payload: { groups: ['group-1', 'group-2'] }
            }
          }
        }
      }
      const mockH = { continue: Symbol('continue') }

      extensionHandler(mockRequest, mockH)

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenGroups: ['group-1', 'group-2'],
          tokenClientId: undefined
        })
      )
    })

    test('should log tokenClientId and undefined tokenGroups for a Cognito 401', async () => {
      await auth.plugin.register(mockServer)

      const extensionHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: {
          isBoom: true,
          output: { statusCode: 401, payload: { message: 'Unauthorized' } },
          message: 'Invalid token'
        },
        path: '/api/v1/metadata',
        method: 'GET',
        info: { remoteAddress: '10.0.0.1' },
        headers: { 'user-agent': 'test-agent' },
        auth: {
          artifacts: {
            decoded: {
              payload: { client_id: 'cognito-client-1' }
            }
          }
        }
      }
      const mockH = { continue: Symbol('continue') }

      extensionHandler(mockRequest, mockH)

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenClientId: 'cognito-client-1',
          tokenGroups: undefined
        })
      )
    })

    test('should log undefined tokenGroups and tokenClientId when no token is decoded', async () => {
      await auth.plugin.register(mockServer)

      const extensionHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: {
          isBoom: true,
          output: { statusCode: 401, payload: { message: 'Unauthorized' } },
          message: 'Missing token'
        },
        path: '/api/v1/metadata',
        method: 'GET',
        info: { remoteAddress: '10.0.0.1' },
        headers: { 'user-agent': 'test-agent' }
        // no auth property — token was absent
      }
      const mockH = { continue: Symbol('continue') }

      extensionHandler(mockRequest, mockH)

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenGroups: undefined,
          tokenClientId: undefined
        })
      )
    })
  })
})
