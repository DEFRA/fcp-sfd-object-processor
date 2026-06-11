import { describe, test, expect, vi, beforeEach } from 'vitest'

const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() }

const { mockConfigGet, capturedClientOptions } = vi.hoisted(() => ({
  mockConfigGet: vi.fn().mockImplementation((key) => {
    switch (key) {
      case 'cdpUploaderTimeoutMs': return 5000
      case 'retry.http.maxAttempts': return 3
      case 'retry.http.unknownMaxAttempts': return 2
      case 'retry.http.baseDelayMs': return 0
      case 'retry.http.backoffMultiplier': return 1
      case 'retry.http.jitterPercentage': return 0
      case 'retry.http.maxDelayMs': return 0
      case 'retry.http.unknownMaxDelayMs': return 0
      default: return null
    }
  }),
  capturedClientOptions: { current: null }
}))

vi.mock('../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

vi.mock('../../../src/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

vi.mock('@fetchkit/ffetch', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createClient: (options) => {
      capturedClientOptions.current = options
      return async (requestUrl, requestOptions = {}) => {
        const request = { url: requestUrl, ...requestOptions }
        options.before?.(request)
        if (requestOptions.fetchHandler) {
          return requestOptions.fetchHandler(request)
        }
        return new Response('ok', { status: 200 })
      }
    }
  }
})

await import('../../../src/http/client.js')

describe('httpClient hook edge cases', () => {
  const options = () => capturedClientOptions.current

  beforeEach(() => {
    vi.clearAllMocks()
    expect(options()).toBeTruthy()
  })

  test('onComplete builds retry state when before hook did not run', () => {
    const request = { url: 'http://test-upstream/no-before' }
    options().hooks.onComplete(request, { status: 200 }, null)

    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ type: 'http_retry_recovered' })
      }),
      expect.any(String)
    )
  })

  test('onComplete logs non-Error terminal failures with generic kind', () => {
    const request = { url: 'http://test-upstream/string-error' }
    options().hooks.before(request)
    options().hooks.onComplete(request, null, 'terminal string failure')

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'http_retry_terminal',
          kind: 'error'
        }),
        error: {
          message: 'terminal string failure'
        }
      }),
      expect.any(String)
    )
  })

  test('classifyError returns nonRetryable when no error or response is present', () => {
    const request = { url: 'http://test-upstream/object-error' }

    const willRetry = options().shouldRetry({
      request,
      attempt: 1,
      error: { code: 'CUSTOM' }
    })

    expect(willRetry).toBe(true)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        retry: expect.objectContaining({
          category: 'unknown',
          terminalReason: expect.stringContaining('CUSTOM')
        })
      }),
      expect.any(String)
    )
  })

  test('shouldRetry initialises retry state when before hook did not run', () => {
    const request = { url: 'http://test-upstream/no-state' }
    const willRetry = options().shouldRetry({
      request,
      attempt: 1,
      error: new Error('first failure')
    })

    expect(willRetry).toBe(true)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        retry: expect.objectContaining({
          category: 'unknown',
          willRetry: true
        })
      }),
      expect.any(String)
    )
  })
})
