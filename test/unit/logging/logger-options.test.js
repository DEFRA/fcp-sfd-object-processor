import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    configGet: vi.fn(),
    getTraceId: vi.fn(),
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

vi.mock('@elastic/ecs-pino-format', () => ({
    ecsFormat: mocks.ecsFormat
}))

describe('logging/logger-options', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.resetModules()

        mocks.ecsFormat.mockReturnValue({ ecs: true })
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

        const result = loggerOptions.mixin()

        expect(result).toEqual({ trace: { id: 'abc-123' } })
    })

    test('mixin returns empty object when traceId is absent', async () => {
        mocks.getTraceId.mockReturnValue(undefined)

        const { loggerOptions } = await import('../../../src/logging/logger-options.js')

        const result = loggerOptions.mixin()

        expect(result).toEqual({})
    })

    test('loggerOptions includes expected base properties', async () => {
        mocks.getTraceId.mockReturnValue(undefined)

        const { loggerOptions } = await import('../../../src/logging/logger-options.js')

        expect(loggerOptions.enabled).toBe(true)
        expect(loggerOptions.level).toBe('info')
        expect(loggerOptions.ignorePaths).toContain('/health')
        expect(loggerOptions.redact.paths).toEqual(['password'])
        expect(loggerOptions.redact.remove).toBe(true)
    })
})
