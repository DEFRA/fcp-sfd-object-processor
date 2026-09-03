import convict from 'convict'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { serverConfig } from '../../../src/config/server.js'

const createConfig = () => convict({ messaging: serverConfig.messaging })

describe('outbox configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('uses a five minute claim lease by default', () => {
    vi.stubEnv('OUTBOX_CLAIM_LEASE_MS', undefined)

    const config = createConfig()

    expect(config.get('messaging.outboxClaimLeaseMs')).toBe(300000)
  })

  test('reads the claim lease from the environment', () => {
    vi.stubEnv('OUTBOX_CLAIM_LEASE_MS', '600000')

    const config = createConfig()
    config.validate({ allowed: 'strict' })

    expect(config.get('messaging.outboxClaimLeaseMs')).toBe(600000)
  })

  test('rejects a non-integer claim lease', () => {
    vi.stubEnv('OUTBOX_CLAIM_LEASE_MS', 'invalid')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })
})

describe('outbox sent TTL configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('uses a seven day TTL by default', () => {
    vi.stubEnv('OUTBOX_SENT_TTL_SECONDS', undefined)

    const config = createConfig()

    expect(config.get('messaging.outboxSentTtlSeconds')).toBe(604800)
  })

  test('reads the TTL from the environment', () => {
    vi.stubEnv('OUTBOX_SENT_TTL_SECONDS', '86400')

    const config = createConfig()
    config.validate({ allowed: 'strict' })

    expect(config.get('messaging.outboxSentTtlSeconds')).toBe(86400)
  })

  test('rejects a non-integer TTL', () => {
    vi.stubEnv('OUTBOX_SENT_TTL_SECONDS', 'invalid')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })

  test('rejects a negative TTL', () => {
    vi.stubEnv('OUTBOX_SENT_TTL_SECONDS', '-1')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })

  test('rejects a zero TTL', () => {
    vi.stubEnv('OUTBOX_SENT_TTL_SECONDS', '0')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })

  test('rejects a TTL below the 60 second minimum', () => {
    vi.stubEnv('OUTBOX_SENT_TTL_SECONDS', '59')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })

  test('accepts a TTL at the 60 second minimum', () => {
    vi.stubEnv('OUTBOX_SENT_TTL_SECONDS', '60')

    const config = createConfig()
    config.validate({ allowed: 'strict' })

    expect(config.get('messaging.outboxSentTtlSeconds')).toBe(60)
  })
})
