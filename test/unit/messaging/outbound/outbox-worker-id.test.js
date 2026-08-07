import { afterEach, describe, expect, test, vi } from 'vitest'

describe('outbox worker ID', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  test('prefers the configured node instance ID', async () => {
    vi.stubEnv('NODE_INSTANCE_ID', 'instance-123')
    vi.stubEnv('HOSTNAME', 'host-456')

    const { outboxWorkerId } = await import('../../../../src/messaging/outbound/outbox-worker-id.js')

    expect(outboxWorkerId).toBe('instance-123')
  })

  test('uses the hostname when no node instance ID is configured', async () => {
    vi.stubEnv('NODE_INSTANCE_ID', '')
    vi.stubEnv('HOSTNAME', 'host-456')

    const { outboxWorkerId } = await import('../../../../src/messaging/outbound/outbox-worker-id.js')

    expect(outboxWorkerId).toBe('host-456')
  })

  test('generates one stable UUID when no runtime identifier is available', async () => {
    vi.stubEnv('NODE_INSTANCE_ID', '')
    vi.stubEnv('HOSTNAME', '')

    const firstImport = await import('../../../../src/messaging/outbound/outbox-worker-id.js')
    const secondImport = await import('../../../../src/messaging/outbound/outbox-worker-id.js')

    expect(firstImport.outboxWorkerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(secondImport.outboxWorkerId).toBe(firstImport.outboxWorkerId)
  })
})
