import { expect, test, describe, beforeEach, vi } from 'vitest'

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

describe('createAuthStrategy', () => {
  let createAuthStrategy
  let strategyOptions
  let validateFunction
  let mockRequest
  let mockCheckAllowed

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    const module = await import('../../../../src/plugins/auth/create-auth-strategy.js')
    createAuthStrategy = module.createAuthStrategy

    mockCheckAllowed = vi.fn()
    mockRequest = {
      path: '/test',
      method: 'GET',
      info: { remoteAddress: '127.0.0.1' },
      headers: { 'user-agent': 'test-agent' }
    }

    strategyOptions = createAuthStrategy({
      strategyName: 'test-strategy',
      jwksUri: 'https://example.com/.well-known/jwks.json',
      verify: { aud: false, sub: false, iss: ['https://example.com'], nbf: true, exp: true },
      getAllowedList: () => ['allowed-value-1', 'allowed-value-2'],
      checkAllowed: mockCheckAllowed,
      emptyListMessage: 'No authorized values configured',
      unauthorizedMessage: 'Token is not authorized'
    })

    validateFunction = strategyOptions.validate
  })

  // Returned options shape
  describe('returned options shape', () => {
    test('should set keys.uri from jwksUri', () => {
      expect(strategyOptions.keys.uri).toBe('https://example.com/.well-known/jwks.json')
    })

    test('should pass verify config through unchanged', () => {
      expect(strategyOptions.verify).toMatchObject({
        aud: false,
        sub: false,
        iss: ['https://example.com'],
        nbf: true,
        exp: true
      })
    })

    test('should expose a validate function', () => {
      expect(strategyOptions.validate).toBeInstanceOf(Function)
    })
  })

  // Token type validation
  describe('token type validation', () => {
    test('should reject token with an invalid typ claim', async () => {
      const payload = { typ: 'id_token', sub: 'user-1', iss: 'https://example.com' }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Provided token is not an access token')
    })

    test('should call buildAuthFailureLog with token type context when typ is invalid', async () => {
      const payload = { typ: 'refresh', sub: 'user-1', iss: 'https://example.com' }
      await validateFunction({ decoded: { payload } }, mockRequest, {})

      expect(mockBuildAuthFailureLog).toHaveBeenCalledOnce()
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'Provided token is not an access token',
        mockRequest,
        { tokenType: 'refresh', issuer: 'https://example.com', strategy: 'test-strategy' }
      )
      expect(mockLogger.warn).toHaveBeenCalledWith(mockBuildAuthFailureLog.mock.results[0].value)
    })

    test('should accept JWT token type', async () => {
      mockCheckAllowed.mockReturnValue({ allowed: true, failureContext: {} })
      const payload = { typ: 'JWT', sub: 'user-1' }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
    })

    test('should accept at+jwt token type', async () => {
      mockCheckAllowed.mockReturnValue({ allowed: true, failureContext: {} })
      const payload = { typ: 'at+jwt', sub: 'user-1' }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
    })

    test('should accept token without a typ claim', async () => {
      mockCheckAllowed.mockReturnValue({ allowed: true, failureContext: {} })
      const payload = { sub: 'user-1' }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})
      expect(result.isValid).toBe(true)
    })
  })

  // Empty allowed list
  describe('empty allowed list', () => {
    beforeEach(() => {
      strategyOptions = createAuthStrategy({
        strategyName: 'test-strategy',
        jwksUri: 'https://example.com/.well-known/jwks.json',
        verify: {},
        getAllowedList: () => [],
        checkAllowed: mockCheckAllowed,
        emptyListMessage: 'No authorized values configured',
        unauthorizedMessage: 'Token is not authorized'
      })
      validateFunction = strategyOptions.validate
    })

    test('should reject token when allowed list is empty', async () => {
      const result = await validateFunction(
        { decoded: { payload: { typ: 'JWT', sub: 'user-1' } } },
        mockRequest,
        {}
      )
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized values configured')
    })

    test('should call buildAuthFailureLog with strategy context when list is empty', async () => {
      await validateFunction(
        { decoded: { payload: { typ: 'JWT', sub: 'user-1' } } },
        mockRequest,
        {}
      )
      expect(mockBuildAuthFailureLog).toHaveBeenCalledOnce()
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'No authorized values configured',
        mockRequest,
        { strategy: 'test-strategy' }
      )
    })

    test('should not call checkAllowed when allowed list is empty', async () => {
      await validateFunction(
        { decoded: { payload: { typ: 'JWT', sub: 'user-1' } } },
        mockRequest,
        {}
      )
      expect(mockCheckAllowed).not.toHaveBeenCalled()
    })
  })

  // Unauthorized token
  describe('unauthorized token', () => {
    test('should reject token when checkAllowed returns false', async () => {
      mockCheckAllowed.mockReturnValue({ allowed: false, failureContext: { customField: 'value' } })
      const result = await validateFunction(
        { decoded: { payload: { typ: 'JWT', sub: 'user-1' } } },
        mockRequest,
        {}
      )
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token is not authorized')
    })

    test('should call buildAuthFailureLog with failureContext merged with strategy name', async () => {
      mockCheckAllowed.mockReturnValue({ allowed: false, failureContext: { clientId: 'bad-client', issuer: 'https://example.com' } })
      await validateFunction(
        { decoded: { payload: { typ: 'JWT', sub: 'user-1' } } },
        mockRequest,
        {}
      )
      expect(mockBuildAuthFailureLog).toHaveBeenCalledOnce()
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'Token is not authorized',
        mockRequest,
        { clientId: 'bad-client', issuer: 'https://example.com', strategy: 'test-strategy' }
      )
    })
  })

  // Valid token
  describe('valid token', () => {
    beforeEach(() => {
      mockCheckAllowed.mockReturnValue({ allowed: true, failureContext: {} })
    })

    test('should return isValid true with credentials on success', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', groups: ['group-1'] }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})

      expect(result.isValid).toBe(true)
      expect(result.credentials).toEqual({ token: payload, principalId: 'user-123' })
    })

    test('should preserve all token payload fields in credentials', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', name: 'Test User', email: 'test@example.com', custom: 'value' }
      const result = await validateFunction({ decoded: { payload } }, mockRequest, {})

      expect(result.credentials.token).toEqual(payload)
    })

    test('should not call buildAuthFailureLog on success', async () => {
      await validateFunction(
        { decoded: { payload: { typ: 'JWT', sub: 'user-1' } } },
        mockRequest,
        {}
      )
      expect(mockBuildAuthFailureLog).not.toHaveBeenCalled()
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })
  })
})
