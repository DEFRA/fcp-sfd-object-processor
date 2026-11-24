import Hapi from '@hapi/hapi'
import jwt from '@hapi/jwt'
import { generateKeyPairSync } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { AUTH_ALLOWED_SCOPE } from '../../../../src/constants/auth.js'

// The audit publisher fires from the plugin's onPreResponse hook. It is mocked so nothing here can
// attempt a real SNS publish.
vi.mock('../../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() })
}))

const ENTRA_TENANTS = [
  { tenantId: '11111111-1111-1111-1111-111111111111', allowedGroupIds: ['22222222-2222-2222-2222-222222222222'] },
  { tenantId: '33333333-3333-3333-3333-333333333333', allowedGroupIds: ['44444444-4444-4444-4444-444444444444'] }
]

const BOTH_PROVIDERS_ENV = {
  AUTH_ENTRA_ENABLED: 'true',
  AUTH_ENTRA_TENANTS: JSON.stringify(ENTRA_TENANTS),
  AUTH_COGNITO_ENABLED: 'true',
  AUTH_COGNITO_USER_POOL_ID: 'eu-west-2_testPoolId',
  AUTH_COGNITO_CLIENT_IDS: 'testclientid'
}

const AUTH_ENV_KEYS = [
  'AUTH_ENTRA_ENABLED',
  'AUTH_ENTRA_TENANTS',
  'AUTH_COGNITO_ENABLED',
  'AUTH_COGNITO_USER_POOL_ID',
  'AUTH_COGNITO_CLIENT_IDS'
]

/**
 * Registers `@hapi/jwt` and the auth plugin against a real Hapi server under the supplied
 * environment, and adds one route that inherits whatever default strategy the plugin set.
 *
 * `server.auth.strategy()` validates the options object against `@hapi/jwt`'s own Joi schema, so a
 * composed object the library rejects fails here rather than on deployment. The server is
 * deliberately not initialised: `@hapi/jwt` primes every configured JWKS URI over the network in its
 * `onPreStart` handler, which these placeholder tenants have no endpoint for.
 * @param {object} env - Auth environment variables to apply before the config module is loaded
 */
const buildServer = async (env) => {
  vi.resetModules()

  for (const key of AUTH_ENV_KEYS) {
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value
  }

  const { auth } = await import('../../../../src/plugins/auth/index.js')

  const server = Hapi.server()
  await server.register(jwt)
  await server.register(auth)

  server.route({
    method: 'GET',
    path: '/protected',
    handler: () => ({ ok: true })
  })

  return server
}

describe('auth plugin registration against a real hapi server', () => {
  afterEach(() => {
    for (const key of AUTH_ENV_KEYS) {
      delete process.env[key]
    }
  })

  test('should register the composed options for both providers without error', async () => {
    const server = await buildServer(BOTH_PROVIDERS_ENV)

    expect(server.auth.settings.default.strategies).toEqual(['bearer'])
  })

  test('should make the strategy required by default so routes must opt out', async () => {
    const server = await buildServer(BOTH_PROVIDERS_ENV)

    expect(server.auth.settings.default.mode).toEqual('required')
    expect(server.auth.settings.default.access[0].scope.selection).toEqual([AUTH_ALLOWED_SCOPE])
  })

  test('should register when only Entra is enabled', async () => {
    const server = await buildServer({
      AUTH_ENTRA_ENABLED: 'true',
      AUTH_ENTRA_TENANTS: JSON.stringify(ENTRA_TENANTS),
      AUTH_COGNITO_ENABLED: 'false'
    })

    expect(server.auth.settings.default.strategies).toEqual(['bearer'])
  })

  test('should register when only Cognito is enabled', async () => {
    const server = await buildServer({
      AUTH_ENTRA_ENABLED: 'false',
      AUTH_COGNITO_ENABLED: 'true',
      AUTH_COGNITO_USER_POOL_ID: 'eu-west-2_testPoolId',
      AUTH_COGNITO_CLIENT_IDS: 'testclientid'
    })

    expect(server.auth.settings.default.strategies).toEqual(['bearer'])
  })

  test('should not register a strategy when Entra is enabled but no tenants are configured', async () => {
    const server = await buildServer({
      AUTH_ENTRA_ENABLED: 'true',
      AUTH_ENTRA_TENANTS: '[]',
      AUTH_COGNITO_ENABLED: 'false'
    })

    expect(server.auth.settings.default).toBeNull()

    await server.initialize()
    const response = await server.inject({ method: 'GET', url: '/protected' })

    expect(response.statusCode).toEqual(200)
    await server.stop()
  })

  test('should not register a strategy when no provider is enabled', async () => {
    const server = await buildServer({
      AUTH_ENTRA_ENABLED: 'false',
      AUTH_COGNITO_ENABLED: 'false'
    })

    expect(server.auth.settings.default).toBeNull()

    await server.initialize()
    const response = await server.inject({ method: 'GET', url: '/protected' })

    expect(response.statusCode).toEqual(200)
    await server.stop()
  })
})

describe('authorization scope with signed Cognito-style tokens', () => {
  const issuer = 'https://cognito.example.test/pool'
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  let protectedServer

  const buildProtectedServer = async () => {
    const { createAuthStrategy } = await import('../../../../src/plugins/auth/create-auth-strategy.js')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' })
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
    const options = createAuthStrategy([{
      name: 'cognito',
      jwksUris: [],
      issuers: [issuer],
      getAllowedList: () => ['permitted-client'],
      checkAllowed: (payload, allowedIds) => ({
        allowed: allowedIds.includes(payload.client_id),
        failureContext: { clientId: payload.client_id }
      }),
      getPrincipalId: (payload) => payload.client_id,
      emptyListMessage: 'No authorized Cognito client IDs configured',
      unauthorisedMessage: 'Token client_id is not in the list of authorized Cognito client IDs'
    }])

    options.keys = [{ key: publicKeyPem, algorithms: ['RS256'], kid: 'auth-test-key' }]

    const server = Hapi.server()
    await server.register(jwt)
    server.auth.strategy('bearer', 'jwt', options)
    server.auth.default({
      strategy: 'bearer',
      access: [{ scope: [AUTH_ALLOWED_SCOPE] }]
    })
    server.route([
      {
        method: 'GET',
        path: '/api/v1/blob/{fileId}',
        handler: () => ({ url: 'https://private.example.test/presigned-url' })
      },
      {
        method: 'GET',
        path: '/api/v1/metadata/sbi/{sbi}',
        handler: () => ({ metadata: 'private metadata' })
      },
      {
        method: 'GET',
        path: '/health',
        options: { auth: false },
        handler: () => ({ status: 'ok' })
      },
      {
        method: 'POST',
        path: '/api/v1/callback',
        options: { auth: false },
        handler: (_request, h) => h.response({ accepted: true }).code(201)
      }
    ])
    await server.initialize()

    return {
      server,
      makeToken: (clientId) => jwt.token.generate({
        iss: issuer,
        client_id: clientId,
        sub: 'cognito-subject',
        typ: 'JWT'
      }, { key: privateKeyPem, algorithm: 'RS256' }, {
        header: { kid: 'auth-test-key' }
      })
    }
  }

  beforeAll(async () => {
    protectedServer = await buildProtectedServer()
  })

  afterAll(async () => {
    await protectedServer.server.stop()
  })

  test.each([
    '/api/v1/blob/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
    '/api/v1/metadata/sbi/805000000'
  ])('returns 403 without protected data for a valid token from a denied caller: %s', async (path) => {
    const { server, makeToken } = protectedServer
    const response = await server.inject({
      method: 'GET',
      url: path,
      headers: { authorization: ['Bearer', makeToken('denied-client')].join(' ') }
    })

    expect(response.statusCode, JSON.stringify(response.result)).toBe(403)
    expect(response.result.message).toBe('Insufficient scope')
    expect(response.result).not.toHaveProperty('metadata')
    expect(response.result).not.toHaveProperty('url')
  })

  test.each([
    '/api/v1/blob/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
    '/api/v1/metadata/sbi/805000000'
  ])('still returns 401 when no token is provided: %s', async (path) => {
    const { server } = protectedServer
    const response = await server.inject({
      method: 'GET',
      url: path
    })
    expect(response.statusCode).toBe(401)
    expect(response.statusCode).toBe(401)
  })

  test('permits allowed scope and leaves health unauthenticated', async () => {
    const { server, makeToken } = protectedServer
    const protectedResponse = await server.inject({
      method: 'GET',
      url: '/api/v1/blob/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      headers: { authorization: ['Bearer', makeToken('permitted-client')].join(' ') }
    })
    const healthResponse = await server.inject({ method: 'GET', url: '/health' })
    const callbackResponse = await server.inject({ method: 'POST', url: '/api/v1/callback' })

    expect(protectedResponse.statusCode, JSON.stringify(protectedResponse.result)).toBe(200)
    expect(healthResponse.statusCode).toBe(200)
    expect(callbackResponse.statusCode).toBe(201)
  })
})
