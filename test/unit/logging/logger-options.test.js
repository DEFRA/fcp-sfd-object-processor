import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTraceId: vi.fn(),
  getCorrelationId: vi.fn()
}))

vi.mock('../../../src/config/index.js', () => ({
  config: {
    get: vi.fn(key => {
      if (key === 'log') return { enabled: true, redact: [], level: 'info', format: 'pino-pretty' }
      if (key === 'serviceName') return 'test-service'
      if (key === 'serviceVersion') return '1.0.0'
      return undefined
    })
  }
}))

vi.mock('@defra/hapi-tracing', () => ({ getTraceId: mocks.getTraceId }))
vi.mock('../../../src/logging/correlation-id-store.js', () => ({
  getCorrelationId: mocks.getCorrelationId
}))

const { loggerOptions } = await import('../../../src/logging/logger-options.js')

describe('loggerOptions mixin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTraceId.mockReturnValue(undefined)
    mocks.getCorrelationId.mockReturnValue(undefined)
  })

  test('adds trace and flattened transaction IDs when both contexts are present', () => {
    mocks.getTraceId.mockReturnValue('trace-1')
    mocks.getCorrelationId.mockReturnValue('correlation-1')

    expect(loggerOptions.mixin()).toEqual({
      trace: { id: 'trace-1' },
      'transaction.id': 'correlation-1'
    })
  })

  test('omits context fields when neither value is present', () => {
    expect(loggerOptions.mixin()).toEqual({})
  })
})
