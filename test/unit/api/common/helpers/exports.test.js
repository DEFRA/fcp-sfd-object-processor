import { describe, expect, test, vi } from 'vitest'

import hapiPino from 'hapi-pino'
import hapiPulse from 'hapi-pulse'
import { tracing } from '@defra/hapi-tracing'

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() })
}))

vi.mock('../../../../../src/data/db.js', () => ({
  closeDb: vi.fn()
}))

vi.mock('../../../../../src/messaging/outbound/index.js', () => ({
  stopOutbox: vi.fn()
}))

describe('API helper exports', () => {
  test('requestLogger exports plugin and options', async () => {
    const { requestLogger } = await import('../../../../../src/api/common/helpers/request-logger.js')

    expect(requestLogger.plugin).toBe(hapiPino)
    expect(requestLogger.options).toBeDefined()
  })

  test('requestTracing exports tracing plugin and header option', async () => {
    const { requestTracing } = await import('../../../../../src/api/common/helpers/request-tracing.js')

    expect(requestTracing.plugin).toBe(tracing.plugin)
    expect(requestTracing.options).toHaveProperty('tracingHeader')
  })

  test('pulse exports plugin and options uses createLogger', async () => {
    const { pulse } = await import('../../../../../src/api/common/helpers/pulse.js')

    expect(pulse.plugin).toBe(hapiPulse)
    expect(pulse.options).toHaveProperty('logger')
    expect(pulse.options).toHaveProperty('timeout')
  })

  test('pulse closes the MongoDB client after the server stops on shutdown', async () => {
    const { pulse } = await import('../../../../../src/api/common/helpers/pulse.js')
    const { closeDb } = await import('../../../../../src/data/db.js')

    await pulse.options.postServerStop()

    expect(closeDb).toHaveBeenCalledTimes(1)
  })

  test('pulse cancels the outbox poll loop before the server drains on shutdown', async () => {
    const { pulse } = await import('../../../../../src/api/common/helpers/pulse.js')
    const { stopOutbox } = await import('../../../../../src/messaging/outbound/index.js')

    await pulse.options.preServerStop()

    expect(stopOutbox).toHaveBeenCalledTimes(1)
  })
})
