import { describe, test, expect, vi, beforeEach } from 'vitest'

const mockWarn = vi.fn()
vi.mock('../../../src/logging/logger.js', () => ({ createLogger: () => ({ warn: mockWarn }) }))

let createAuthStrategy

beforeEach(async () => {
  mockWarn.mockClear()
  const mod = await import('../../../src/plugins/auth/create-auth-strategy.js')
  createAuthStrategy = mod.createAuthStrategy
})

describe('createAuthStrategy', () => {
  test('invalid token type returns not valid and logs warning', async () => {
    const strat = createAuthStrategy({
      strategyName: 'entra',
      jwksUri: 'http://jwks',
      verify: {},
      getAllowedList: () => ['a'],
      checkAllowed: () => ({ allowed: true }),
      emptyListMessage: 'NO_LIST',
      unauthorisedMessage: 'NO_AUTH'
    })

    const artifacts = { decoded: { payload: { typ: 'id_token', iss: 'iss', sub: 'sub-1' } } }
    const request = { path: '/test', method: 'GET', info: { remoteAddress: '1.2.3.4' } }

    const result = await strat.validate(artifacts, request, {})

    expect(result.isValid).toBe(false)
    expect(result.errorMessage).toBe('Provided token is not an access token')
    expect(mockWarn).toHaveBeenCalled()
  })

  test('empty allowed list returns not valid and logs warning', async () => {
    const strat = createAuthStrategy({
      strategyName: 'entra',
      jwksUri: 'http://jwks',
      verify: {},
      getAllowedList: () => [],
      checkAllowed: () => ({ allowed: false }),
      emptyListMessage: 'EMPTY',
      unauthorisedMessage: 'NO_AUTH'
    })

    const artifacts = { decoded: { payload: {} } }
    const request = { path: '/x', method: 'POST', info: { remoteAddress: '1.1.1.1' } }

    const result = await strat.validate(artifacts, request, {})

    expect(result.isValid).toBe(false)
    expect(result.errorMessage).toBe('EMPTY')
    expect(mockWarn).toHaveBeenCalled()
  })

  test('not allowed by checkAllowed returns not valid and logs warning', async () => {
    const strat = createAuthStrategy({
      strategyName: 'entra',
      jwksUri: 'http://jwks',
      verify: {},
      getAllowedList: () => ['a'],
      checkAllowed: () => ({ allowed: false, failureContext: { group: 'g' } }),
      emptyListMessage: 'EMPTY',
      unauthorisedMessage: 'NO_AUTH'
    })

    const artifacts = { decoded: { payload: { sub: 'sub-1' } } }
    const request = { path: '/y', method: 'PUT', info: { remoteAddress: '2.2.2.2' } }

    const result = await strat.validate(artifacts, request, {})

    expect(result.isValid).toBe(false)
    expect(result.errorMessage).toBe('NO_AUTH')
    expect(mockWarn).toHaveBeenCalled()
  })

  test('allowed returns credentials and does not log', async () => {
    const strat = createAuthStrategy({
      strategyName: 'entra',
      jwksUri: 'http://jwks',
      verify: {},
      getAllowedList: () => ['a'],
      checkAllowed: () => ({ allowed: true }),
      emptyListMessage: 'EMPTY',
      unauthorisedMessage: 'NO_AUTH'
    })

    const payload = { sub: 'sub-1', aud: 'aud' }
    const artifacts = { decoded: { payload } }
    const request = { path: '/', method: 'GET', info: { remoteAddress: '127.0.0.1' } }

    const result = await strat.validate(artifacts, request, {})

    expect(result.isValid).toBe(true)
    expect(result.credentials).toEqual({ token: payload, principalId: 'sub-1' })
    expect(mockWarn).not.toHaveBeenCalled()
  })
})
