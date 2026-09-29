import { afterEach, beforeEach, describe, expect, vi, test } from 'vitest'
import { startOutbox } from '../../../../src/messaging/outbound/index.js'
import { publishPendingMessages } from '../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js'

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn()
}))

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), error: mockLoggerError })
}))

vi.mock('../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js', () => ({
  publishPendingMessages: vi.fn().mockResolvedValue(undefined)
}))

// Fake timers stop each run's rescheduled poll from firing after the test ends;
// vi.useRealTimers() discards the pending fake timer.
describe('startOutbox tests', () => {
  let timeoutSpy

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
  })

  afterEach(() => {
    timeoutSpy.mockRestore()
    vi.useRealTimers()
  })

  describe('when startOutbox encounters an error', () => {
    test('should resolve rather than reject, so the failure cannot stop the process', async () => {
      publishPendingMessages.mockRejectedValueOnce(new Error('Test error'))

      await expect(startOutbox()).resolves.toBeUndefined()
    })

    test('should log the failure once with the original error and ECS event fields', async () => {
      const testError = new Error('Test error')
      publishPendingMessages.mockRejectedValueOnce(testError)

      await startOutbox()

      expect(mockLoggerError).toHaveBeenCalledTimes(1)
      expect(mockLoggerError).toHaveBeenCalledWith({
        err: testError,
        event: {
          type: 'outbox_poll_failure',
          action: 'publish_pending',
          outcome: 'failure'
        }
      }, 'Outbox processing failed')
    })

    test('should schedule the next run', async () => {
      publishPendingMessages.mockRejectedValueOnce(new Error('Test error'))

      await startOutbox()

      expect(timeoutSpy).toHaveBeenCalledWith(startOutbox, 30000)
    })
  })

  describe('when startOutbox processes successfully', () => {
    test('should schedule the next run', async () => {
      await startOutbox()

      expect(timeoutSpy).toHaveBeenCalledWith(startOutbox, 30000)
    })

    test('should not log an error', async () => {
      await startOutbox()

      expect(mockLoggerError).not.toHaveBeenCalled()
    })
  })

  test('keeps polling on the configured interval after a failed run', async () => {
    publishPendingMessages.mockRejectedValueOnce(new Error('Test error'))

    await startOutbox()
    expect(publishPendingMessages).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30000)

    expect(publishPendingMessages).toHaveBeenCalledTimes(2)
  })
})
