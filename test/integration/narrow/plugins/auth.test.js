import Hapi from '@hapi/hapi'
import jwt from '@hapi/jwt'
import { afterEach, afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { AUTH_ALLOWED_SCOPE } from '../../../../src/constants/auth.js'
import { createEntraTestServer } from '../../../helpers/create-entra-test-server.js'

// The audit publisher fires from the plugin's onPreResponse hook. It is mocked so nothing here can
// attempt a real SNS publish.
vi.mock('../../../../src/messaging/outbound/audit/send-audit-event.js', () => ({
  sendAuditEvent: vi.fn().mockResolvedValue(undefined)
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
  })

  test('should require the object processor access scope by default', async () => {
    const server = await buildServer(BOTH_PROVIDERS_ENV)

    expect(server.auth.settings.default.access[0].scope.selection).toContain(AUTH_ALLOWED_SCOPE)
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

describe('authorization scope on protected API routes', () => {
  let context

  beforeAll(async () => {
    context = await createEntraTestServer({ authOnly: true })
  })

  afterAll(async () => {
    if (context) {
      await context.cleanup()
    }
  })

  test.each([
    { name: 'blob', url: '/api/v1/blob/3f2504e0-4f89-41d3-9a0c-0305e82c3301' },
    { name: 'metadata', url: '/api/v1/metadata/sbi/105000000' }
  ])('returns 403 for a valid token without allowed groups on the $name route', async ({ url }) => {
    const response = await context.server.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${context.deniedToken}` }
    })

    expect(response.statusCode).toBe(403)
    expect(response.result.message).toBe('Insufficient scope')
    expect(response.result.data).toBeUndefined()
  })

  test.each([
    { name: 'blob', url: '/api/v1/blob/3f2504e0-4f89-41d3-9a0c-0305e82c3301' },
    { name: 'metadata', url: '/api/v1/metadata/sbi/105000000' }
  ])('returns 401 for a missing token on the $name route', async ({ url }) => {
    const response = await context.server.inject({ method: 'GET', url })

    expect(response.statusCode).toBe(401)
  })

  test('keeps health and callback routes explicitly unauthenticated', async () => {
    expect(context.server.auth.lookup(context.server.match('GET', '/health'))).toBe(false)
    expect(context.server.auth.lookup(context.server.match('POST', '/api/v1/callback'))).toBe(false)

    const response = await context.server.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
  })
})
