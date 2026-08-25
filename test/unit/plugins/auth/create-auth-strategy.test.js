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

const PROVIDER_A_ISSUER = 'https://provider-a.example.com'
const PROVIDER_B_ISSUER = 'https://provider-b.example.com'

describe('createAuthStrategy', () => {
  let createAuthStrategy
  let strategyOptions
  let validateFunction
  let mockRequest
  let mockCheckAllowed

  const buildProvider = (overrides = {}) => ({
    name: 'provider-a',
    jwksUris: ['https://provider-a.example.com/.well-known/jwks.json'],
    issuers: [PROVIDER_A_ISSUER],
    getAllowedList: () => ['allowed-value-1', 'allowed-value-2'],
    checkAllowed: mockCheckAllowed,
    emptyListMessage: 'No authorized values configured',
    unauthorisedMessage: 'Token is not authorized',
    ...overrides
  })

  const validateWith = (payload) => validateFunction({ decoded: { payload } }, mockRequest, {})

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

    strategyOptions = createAuthStrategy([buildProvider()])
    validateFunction = strategyOptions.validate
  })

  // Guard against an empty provider list
  describe('provider list validation', () => {
    test('should throw when no providers are supplied', () => {
      expect(() => createAuthStrategy([])).toThrow('At least one authentication provider is required')
    })

    test('should throw when providers is not an array', () => {
      expect(() => createAuthStrategy(undefined)).toThrow('At least one authentication provider is required')
    })
  })

  // Returned options shape
  describe('returned options shape', () => {
    test('should build one keys entry per provider JWKS URI', () => {
      expect(strategyOptions.keys).toEqual([
        { uri: 'https://provider-a.example.com/.well-known/jwks.json' }
      ])
    })

    test('should union the JWKS URIs of every provider', () => {
      const options = createAuthStrategy([
        buildProvider({ jwksUris: ['https://tenant-a.example.com/keys', 'https://tenant-b.example.com/keys'] }),
        buildProvider({ name: 'provider-b', issuers: [PROVIDER_B_ISSUER], jwksUris: ['https://cognito.example.com/keys'] })
      ])

      expect(options.keys).toEqual([
        { uri: 'https://tenant-a.example.com/keys' },
        { uri: 'https://tenant-b.example.com/keys' },
        { uri: 'https://cognito.example.com/keys' }
      ])
    })

    test('should de-duplicate a JWKS URI shared by two providers', () => {
      const options = createAuthStrategy([
        buildProvider({ jwksUris: ['https://shared.example.com/keys'] }),
        buildProvider({ name: 'provider-b', issuers: [PROVIDER_B_ISSUER], jwksUris: ['https://shared.example.com/keys'] })
      ])

      expect(options.keys).toEqual([{ uri: 'https://shared.example.com/keys' }])
    })

    test('should union the accepted issuers of every provider into verify.iss', () => {
      const options = createAuthStrategy([
        buildProvider({ issuers: ['https://tenant-a.example.com', 'https://tenant-b.example.com'] }),
        buildProvider({ name: 'provider-b', issuers: [PROVIDER_B_ISSUER] })
      ])

      expect(options.verify.iss).toEqual([
        'https://tenant-a.example.com',
        'https://tenant-b.example.com',
        PROVIDER_B_ISSUER
      ])
    })

    test('should not verify aud or sub, and should verify nbf and exp', () => {
      expect(strategyOptions.verify).toMatchObject({
        aud: false,
        sub: false,
        nbf: true,
        exp: true
      })
    })

    test('should expose a validate function', () => {
      expect(strategyOptions.validate).toBeInstanceOf(Function)
    })
  })

  // Issuer dispatch — the point of the unified strategy
  describe('issuer dispatch', () => {
    let providerA
    let providerB
    let checkAllowedA
    let checkAllowedB
    let getAllowedListA
    let getAllowedListB

    beforeEach(() => {
      checkAllowedA = vi.fn().mockReturnValue({ allowed: true, failureContext: {} })
      checkAllowedB = vi.fn().mockReturnValue({ allowed: true, failureContext: {} })
      getAllowedListA = vi.fn().mockReturnValue(['group-1'])
      getAllowedListB = vi.fn().mockReturnValue(['client-1'])

      providerA = buildProvider({ getAllowedList: getAllowedListA, checkAllowed: checkAllowedA })
      providerB = buildProvider({
        name: 'provider-b',
        issuers: [PROVIDER_B_ISSUER],
        jwksUris: ['https://provider-b.example.com/keys'],
        getAllowedList: getAllowedListB,
        checkAllowed: checkAllowedB
      })

      validateFunction = createAuthStrategy([providerA, providerB]).validate
    })

    test('should route a token to the provider matching its iss claim', async () => {
      await validateWith({ typ: 'JWT', sub: 'user-1', iss: PROVIDER_B_ISSUER })

      expect(getAllowedListB).toHaveBeenCalledOnce()
      expect(checkAllowedB).toHaveBeenCalledOnce()
      expect(getAllowedListA).not.toHaveBeenCalled()
      expect(checkAllowedA).not.toHaveBeenCalled()
    })

    test('should route a token for the first provider without consulting the second', async () => {
      await validateWith({ typ: 'JWT', sub: 'user-1', iss: PROVIDER_A_ISSUER })

      expect(getAllowedListA).toHaveBeenCalledOnce()
      expect(checkAllowedA).toHaveBeenCalledOnce()
      expect(getAllowedListB).not.toHaveBeenCalled()
      expect(checkAllowedB).not.toHaveBeenCalled()
    })

    test('should record the resolved provider name in the credentials', async () => {
      const result = await validateWith({ typ: 'JWT', sub: 'user-1', iss: PROVIDER_B_ISSUER })

      expect(result.credentials.provider).toBe('provider-b')
    })

    test('should reject a token whose issuer matches no provider', async () => {
      const result = await validateWith({ typ: 'JWT', sub: 'user-1', iss: 'https://untrusted.example.com' })

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token issuer is not recognised')
      expect(getAllowedListA).not.toHaveBeenCalled()
      expect(getAllowedListB).not.toHaveBeenCalled()
    })

    test('should log the unrecognised issuer', async () => {
      await validateWith({ typ: 'JWT', sub: 'user-1', iss: 'https://untrusted.example.com' })

      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'Token issuer is not recognised',
        mockRequest,
        { issuer: 'https://untrusted.example.com' }
      )
    })
  })

  // getAllowedList receives the decoded payload
  describe('getAllowedList payload passthrough', () => {
    test('should call getAllowedList with the decoded payload', async () => {
      const getAllowedList = vi.fn().mockReturnValue(['allowed-value-1'])
      validateFunction = createAuthStrategy([buildProvider({ getAllowedList })]).validate
      mockCheckAllowed.mockReturnValue({ allowed: true, failureContext: {} })
      const payload = { typ: 'JWT', sub: 'user-1', iss: PROVIDER_A_ISSUER }

      await validateWith(payload)

      expect(getAllowedList).toHaveBeenCalledWith(payload)
    })
  })

  // Token type validation
  describe('token type validation', () => {
    test('should reject token with an invalid typ claim', async () => {
      const result = await validateWith({ typ: 'id_token', sub: 'user-1', iss: PROVIDER_A_ISSUER })

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Provided token is not an access token')
    })

    test('should call buildAuthFailureLog with token type context when typ is invalid', async () => {
      await validateWith({ typ: 'refresh', sub: 'user-1', iss: PROVIDER_A_ISSUER })

      expect(mockBuildAuthFailureLog).toHaveBeenCalledOnce()
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'Provided token is not an access token',
        mockRequest,
        { tokenType: 'refresh', issuer: PROVIDER_A_ISSUER, strategy: 'provider-a' }
      )
      expect(mockLogger.warn).toHaveBeenCalledWith(mockBuildAuthFailureLog.mock.results[0].value)
    })

    test('should reject an invalid typ before the issuer is resolved', async () => {
      const result = await validateWith({ typ: 'refresh', sub: 'user-1', iss: 'https://untrusted.example.com' })

      expect(result.errorMessage).toBe('Provided token is not an access token')
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'Provided token is not an access token',
        mockRequest,
        { tokenType: 'refresh', issuer: 'https://untrusted.example.com', strategy: undefined }
      )
    })

    test('should accept JWT token type', async () => {
      mockCheckAllowed.mockReturnValue({ allowed: true, failureContext: {} })
      const result = await validateWith({ typ: 'JWT', sub: 'user-1', iss: PROVIDER_A_ISSUER })
      expect(result.isValid).toBe(true)
    })

    test('should accept at+jwt token type', async () => {
      mockCheckAllowed.mockReturnValue({ allowed: true, failureContext: {} })
      const result = await validateWith({ typ: 'at+jwt', sub: 'user-1', iss: PROVIDER_A_ISSUER })
      expect(result.isValid).toBe(true)
    })

    test('should accept token without a typ claim', async () => {
      mockCheckAllowed.mockReturnValue({ allowed: true, failureContext: {} })
      const result = await validateWith({ sub: 'user-1', iss: PROVIDER_A_ISSUER })
      expect(result.isValid).toBe(true)
    })
  })

  // Empty allowed list
  describe('empty allowed list', () => {
    beforeEach(() => {
      validateFunction = createAuthStrategy([buildProvider({ getAllowedList: () => [] })]).validate
    })

    test('should reject token when allowed list is empty', async () => {
      const result = await validateWith({ typ: 'JWT', sub: 'user-1', iss: PROVIDER_A_ISSUER })

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('No authorized values configured')
    })

    test('should call buildAuthFailureLog with strategy context when list is empty', async () => {
      await validateWith({ typ: 'JWT', sub: 'user-1', iss: PROVIDER_A_ISSUER })

      expect(mockBuildAuthFailureLog).toHaveBeenCalledOnce()
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'No authorized values configured',
        mockRequest,
        { strategy: 'provider-a' }
      )
    })

    test('should not call checkAllowed when allowed list is empty', async () => {
      await validateWith({ typ: 'JWT', sub: 'user-1', iss: PROVIDER_A_ISSUER })

      expect(mockCheckAllowed).not.toHaveBeenCalled()
    })
  })

  // Unauthorized token
  describe('unauthorized token', () => {
    test('should reject token when checkAllowed returns false', async () => {
      mockCheckAllowed.mockReturnValue({ allowed: false, failureContext: { customField: 'value' } })
      const result = await validateWith({ typ: 'JWT', sub: 'user-1', iss: PROVIDER_A_ISSUER })

      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toBe('Token is not authorized')
    })

    test('should call buildAuthFailureLog with failureContext merged with the provider name', async () => {
      mockCheckAllowed.mockReturnValue({ allowed: false, failureContext: { clientId: 'bad-client', issuer: PROVIDER_A_ISSUER } })
      await validateWith({ typ: 'JWT', sub: 'user-1', iss: PROVIDER_A_ISSUER })

      expect(mockBuildAuthFailureLog).toHaveBeenCalledOnce()
      expect(mockBuildAuthFailureLog).toHaveBeenCalledWith(
        'Token is not authorized',
        mockRequest,
        { clientId: 'bad-client', issuer: PROVIDER_A_ISSUER, strategy: 'provider-a' }
      )
    })
  })

  // Valid token
  describe('valid token', () => {
    beforeEach(() => {
      mockCheckAllowed.mockReturnValue({ allowed: true, failureContext: {} })
    })

    test('should return isValid true with credentials on success', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', groups: ['group-1'], iss: PROVIDER_A_ISSUER }
      const result = await validateWith(payload)

      expect(result.isValid).toBe(true)
      expect(result.credentials).toEqual({ token: payload, principalId: 'user-123', provider: 'provider-a' })
    })

    test('should preserve all token payload fields in credentials', async () => {
      const payload = { typ: 'JWT', sub: 'user-123', name: 'Test User', email: 'test@example.com', custom: 'value', iss: PROVIDER_A_ISSUER }
      const result = await validateWith(payload)

      expect(result.credentials.token).toEqual(payload)
    })

    test('should not call buildAuthFailureLog on success', async () => {
      await validateWith({ typ: 'JWT', sub: 'user-1', iss: PROVIDER_A_ISSUER })

      expect(mockBuildAuthFailureLog).not.toHaveBeenCalled()
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })
  })
})
