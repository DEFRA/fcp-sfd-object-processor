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
