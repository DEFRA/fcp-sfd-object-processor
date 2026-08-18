import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  configGet: vi.fn(),
  getTraceId: vi.fn(),
  getCorrelationId: vi.fn(),
  ecsFormat: vi.fn()
}))

vi.mock('../../../src/config/index.js', () => ({
  config: {
    get: mocks.configGet
  }
}))

vi.mock('@defra/hapi-tracing', () => ({
  getTraceId: mocks.getTraceId
}))

vi.mock('../../../src/logging/correlation-id-store.js', () => ({
  getCorrelationId: mocks.getCorrelationId
}))

vi.mock('@elastic/ecs-pino-format', () => ({
  ecsFormat: mocks.ecsFormat
}))

describe('logging/logger-options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    mocks.ecsFormat.mockReturnValue({ ecs: true })
    mocks.getTraceId.mockReturnValue(undefined)
    mocks.getCorrelationId.mockReturnValue(undefined)
    mocks.configGet.mockImplementation((key) => {
      switch (key) {
        case 'log':
          return {
            enabled: true,
            level: 'info',
            format: 'ecs',
            redact: ['password']
          }
        case 'serviceName':
          return 'test-service'
        case 'serviceVersion':
          return '1.0.0'
        default:
          return undefined
      }
    })
  })

  test('mixin returns trace id when traceId is present', async () => {
    mocks.getTraceId.mockReturnValue('abc-123')

    const { loggerOptions } = await import('../../../src/logging/logger-options.js')

    expect(loggerOptions.mixin()).toEqual({ trace: { id: 'abc-123' } })
  })

  test('mixin returns flattened transaction id when correlationId is present', async () => {
    mocks.getCorrelationId.mockReturnValue('corr-123')

    const { loggerOptions } = await import('../../../src/logging/logger-options.js')

    expect(loggerOptions.mixin()).toEqual({ 'transaction.id': 'corr-123' })
  })

  test('mixin returns trace and transaction IDs when both are present', async () => {
    mocks.getTraceId.mockReturnValue('trace-1')
    mocks.getCorrelationId.mockReturnValue('correlation-1')

    const { loggerOptions } = await import('../../../src/logging/logger-options.js')

    expect(loggerOptions.mixin()).toEqual({
      trace: { id: 'trace-1' },
      'transaction.id': 'correlation-1'
    })
  })

  test('mixin returns empty object when traceId and correlationId are absent', async () => {
    const { loggerOptions } = await import('../../../src/logging/logger-options.js')

    expect(loggerOptions.mixin()).toEqual({})
  })

  test('loggerOptions includes expected base properties', async () => {
    const { loggerOptions } = await import('../../../src/logging/logger-options.js')

    expect(loggerOptions.enabled).toBe(true)
    expect(loggerOptions.level).toBe('info')
    expect(loggerOptions.ignorePaths).toContain('/health')
    expect(loggerOptions.redact.paths).toEqual(['password'])
    expect(loggerOptions.redact.remove).toBe(true)
  })
})
