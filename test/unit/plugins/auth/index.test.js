import { beforeEach, describe, expect, test, vi, afterEach } from 'vitest'

let mockConfigGet = vi.fn()
const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() }

vi.mock('../../../../src/config/index.js', () => ({
  config: { get: (key) => mockConfigGet(key) }
}))

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue(mockLogger)
}))

vi.mock('../../../../src/plugins/auth/entra-options.js', () => ({
  getEntraAuthOptions: vi.fn().mockReturnValue({})
}))

vi.mock('../../../../src/plugins/auth/cognito-options.js', () => ({
  getCognitoAuthOptions: vi.fn().mockReturnValue({})
}))

const { mockPublishAuditEvent } = vi.hoisted(() => ({
  mockPublishAuditEvent: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../../../src/messaging/outbound/audit/publish-audit-event.js', () => ({
  publishAuditEvent: mockPublishAuditEvent
}))

describe('auth plugin register', () => {
  let server

  beforeEach(async () => {
    vi.resetModules()
    mockConfigGet = vi.fn((key) => {
      switch (key) {
        case 'auth.entra.enabled': return false
        case 'auth.cognito.enabled': return false
        case 'auth.entra.tenants': return []
        default: return undefined
      }
    })

    server = {
      auth: { strategy: vi.fn(), default: vi.fn() },
      ext: vi.fn((event, handler) => { server._extHandler = handler })
    }
  })

  test('does nothing when both entra and cognito disabled', async () => {
    const { auth } = await import('../../../../src/plugins/auth/index.js')
    await auth.plugin.register(server)
    expect(server.auth.strategy).not.toHaveBeenCalled()
    expect(server.auth.default).not.toHaveBeenCalled()
  })

  test('registers entra strategies per tenant', async () => {
    mockConfigGet = vi.fn((key) => {
      switch (key) {
        case 'auth.entra.enabled': return true
        case 'auth.cognito.enabled': return false
        case 'auth.entra.tenants': return [{ tenantId: 't1', allowedGroupIds: [] }, { tenantId: 't2', allowedGroupIds: [] }]
        default: return undefined
      }
    })

    const { auth } = await import('../../../../src/plugins/auth/index.js')
    await auth.plugin.register(server)

    expect(server.auth.strategy).toHaveBeenCalledTimes(2)
    expect(server.auth.strategy).toHaveBeenCalledWith('entra-0', 'jwt', expect.any(Object))
    expect(server.auth.strategy).toHaveBeenCalledWith('entra-1', 'jwt', expect.any(Object))
    expect(server.auth.default).toHaveBeenCalledWith({ strategies: ['entra-0', 'entra-1'] })
  })

  test('registers cognito strategy when enabled', async () => {
    mockConfigGet = vi.fn((key) => {
      switch (key) {
        case 'auth.entra.enabled': return false
        case 'auth.cognito.enabled': return true
        default: return undefined
      }
    })

    const { auth } = await import('../../../../src/plugins/auth/index.js')
    await auth.plugin.register(server)

    expect(server.auth.strategy).toHaveBeenCalledWith('cognito', 'jwt', expect.any(Object))
    expect(server.auth.default).toHaveBeenCalledWith('cognito')
  })

  test('onPreResponse logs when unauthorized', async () => {
    mockConfigGet = vi.fn((key) => {
      switch (key) {
        case 'auth.entra.enabled': return false
        case 'auth.cognito.enabled': return true
        default: return undefined
      }
    })

    const { auth } = await import('../../../../src/plugins/auth/index.js')
    await auth.plugin.register(server)

    // ensure ext handler was registered
    expect(typeof server._extHandler).toBe('function')

    const request = {
      path: '/x',
      method: 'GET',
      info: { remoteAddress: '1.2.3.4' },
      headers: { 'user-agent': 'ua' },
      auth: { artifacts: { decoded: { payload: { groups: ['g1'], client_id: 'cid' } } } },
      response: { isBoom: true, output: { statusCode: 401, payload: { message: 'unauth' } }, message: 'unauth' }
    }

    const h = { continue: Symbol('continue') }
    const res = await server._extHandler(request, h)
    expect(res).toBe(h.continue)
    expect(mockLogger.warn).toHaveBeenCalled()
    const warnArg = mockLogger.warn.mock.calls[0][0]
    expect(warnArg).toMatchObject({ msg: 'Authentication failed', path: '/x', method: 'GET', sourceIp: '1.2.3.4' })
    expect(warnArg.tokenGroups).toEqual(['g1'])
    expect(warnArg.tokenClientId).toBe('cid')
  })
})

// Reuse the top-level `mockConfigGet` and `mockLogger` declared above.
const mockWarn = mockLogger.warn

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
        case 'auth.entra.tenants': return [{ tenantId: 'test-tenant-id', allowedGroupIds: ['group-1', 'group-2'] }]
        case 'auth.cognito.enabled': return false
        case 'tracing.header': return 'x-cdp-request-id'
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
      expect(mockServer.auth.strategy).toHaveBeenCalledWith(expect.stringMatching(/^entra-\d+$/), 'jwt', expect.any(Object))
    })

    test('should set default to entra strategy when only entra is enabled', async () => {
      await auth.plugin.register(mockServer)
      expect(mockServer.auth.default).toHaveBeenCalledWith(expect.stringMatching(/^entra-\d+$/))
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
          case 'auth.entra.tenants': return [{ tenantId: 'test-tenant-id', allowedGroupIds: ['group-1'] }]
          case 'auth.cognito.enabled': return true
          case 'auth.cognito.userPoolId': return 'eu-west-2_testPoolId'
          case 'auth.cognito.clientIds': return ['client-1']
          default: return null
        }
      })

      const { auth: dualAuth } = await import('../../../../src/plugins/auth/index.js')
      const newMockServer = { auth: { strategy: vi.fn(), default: vi.fn() }, ext: vi.fn() }

      await dualAuth.plugin.register(newMockServer)

      expect(newMockServer.auth.strategy).toHaveBeenCalledWith(expect.stringMatching(/^entra-\d+$/), 'jwt', expect.any(Object))
      expect(newMockServer.auth.strategy).toHaveBeenCalledWith('cognito', 'jwt', expect.any(Object))
      expect(newMockServer.auth.default).toHaveBeenCalledWith({ strategies: [expect.stringMatching(/^entra-\d+$/), 'cognito'] })
    })

    test('should register strategies in order entra then cognito', async () => {
      vi.resetModules()
      mockConfigGet.mockImplementation((key) => {
        switch (key) {
          case 'auth.entra.enabled': return true
          case 'auth.entra.tenants': return [{ tenantId: 'test-tenant-id', allowedGroupIds: ['group-1'] }]
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

      // strategy names should be per-tenant (e.g. entra-0) followed by cognito
      expect(callOrder[0]).toMatch(/strategy:entra-\d+/)
      expect(callOrder[1]).toBe('strategy:cognito')
      expect(callOrder[2]).toBe('default')
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

      const result = await extensionHandler(mockRequest, mockH)

      expect(result).toBe(mockH.continue)
      expect(mockWarn).not.toHaveBeenCalled()
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

      const result = await extensionHandler(mockRequest, mockH)

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

      await extensionHandler(mockRequest, mockH)

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

      await extensionHandler(mockRequest, mockH)

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

      await extensionHandler(mockRequest, mockH)

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenGroups: undefined,
          tokenClientId: undefined
        })
      )
    })

    describe('event 7 — security audit event on auth failure', () => {
      beforeEach(() => {
        mockPublishAuditEvent.mockResolvedValue(undefined)
      })

      const build401Request = () => ({
        response: {
          isBoom: true,
          output: { statusCode: 401, payload: { message: 'Unauthorized' } },
          message: 'Invalid token'
        },
        path: '/api/v1/metadata',
        method: 'GET',
        info: { remoteAddress: '10.0.0.1' },
        headers: { 'x-cdp-request-id': 'test-correlation-id', 'user-agent': 'test-agent' }
      })

      test('emits security + audit event on 401 response', async () => {
        await auth.plugin.register(mockServer)

        const extensionHandler = mockServer.ext.mock.calls[0][1]
        await extensionHandler(build401Request(), { continue: Symbol('continue') })

        expect(mockPublishAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationid: 'test-correlation-id',
            security: expect.objectContaining({
              pmccode: 'AUTH',
              priority: 1
            }),
            audit: expect.objectContaining({
              entities: [{ entity: 'document', action: 'failed' }],
              status: 'failure',
              details: expect.objectContaining({ path: '/api/v1/metadata', method: 'GET' })
            })
          })
        )
      })

      test('does not emit audit event for non-401 responses', async () => {
        await auth.plugin.register(mockServer)

        const extensionHandler = mockServer.ext.mock.calls[0][1]
        const nonAuthRequest = {
          response: { isBoom: true, output: { statusCode: 403 } },
          path: '/test',
          method: 'GET',
          info: { remoteAddress: '127.0.0.1' },
          headers: {}
        }
        await extensionHandler(nonAuthRequest, { continue: Symbol('continue') })

        expect(mockPublishAuditEvent).not.toHaveBeenCalled()
      })

      test('audit failure does not prevent h.continue being returned', async () => {
        mockPublishAuditEvent.mockRejectedValueOnce(new Error('SNS down'))
        await auth.plugin.register(mockServer)

        const extensionHandler = mockServer.ext.mock.calls[0][1]
        const mockH = { continue: Symbol('continue') }
        const result = await extensionHandler(build401Request(), mockH)

        expect(result).toBe(mockH.continue)
      })
    })
  })
})
