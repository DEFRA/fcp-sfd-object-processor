import { afterEach, beforeEach, describe, expect, vi, test } from 'vitest'
import { startOutbox } from '../../../../src/messaging/outbound/index.js'
import { publishPendingMessages } from '../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js'

const { mockLoggerError, mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn()
}))

vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: mockLoggerWarn, error: mockLoggerError })
}))

vi.mock('../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js', () => ({
  publishPendingMessages: vi.fn().mockResolvedValue(undefined)
}))

const drainTimeoutLog = [
  { event: { type: 'outbox_drain_timeout', action: 'stop', outcome: 'failure' } },
  'Outbox run did not finish before shutdown; its claimed entries will be retried once the claim expires'
]

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
})

// Uses fresh module instances because the stop flag is module-level state, and
// leaking a stopped module into another test would silence its timer.
describe('stopOutbox tests', () => {
  const importOutbox = async () => {
    const outbox = await import('../../../../src/messaging/outbound/index.js')
    const publisher = await import('../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js')

    return { ...outbox, publishPendingMessages: publisher.publishPendingMessages }
  }

  const trackResolution = (promise) => {
    const state = { resolved: false }
    state.promise = promise.then(() => { state.resolved = true })
    return state
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('keeps polling on the configured interval while it is running', async () => {
    const { startOutbox: start, publishPendingMessages: publish } = await importOutbox()

    await start()
    expect(publish).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30000)

    expect(publish).toHaveBeenCalledTimes(2)
  })

  test('cancels the pending poll timer so no further run reaches MongoDB', async () => {
    const { startOutbox: start, stopOutbox: stop, publishPendingMessages: publish } = await importOutbox()

    await start()
    expect(publish).toHaveBeenCalledTimes(1)

    await stop()
    await vi.advanceTimersByTimeAsync(120000)

    expect(publish).toHaveBeenCalledTimes(1)
  })

  test('stops a run that is already in flight from rescheduling itself', async () => {
    const { startOutbox: start, stopOutbox: stop, publishPendingMessages: publish } = await importOutbox()

    // Mirrors shutdown landing mid-run: preServerStop fires while publishing is
    // still awaiting, so the finally block must not queue another tick.
    publish.mockImplementationOnce(async () => {
      stop()
    })

    await start()
    await vi.advanceTimersByTimeAsync(120000)

    expect(publish).toHaveBeenCalledTimes(1)
  })

  test('stops rescheduling when the in-flight run fails', async () => {
    const { startOutbox: start, stopOutbox: stop, publishPendingMessages: publish } = await importOutbox()

    publish.mockImplementationOnce(async () => {
      stop()
      throw new Error('Test error')
    })

    await expect(start()).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(120000)

    expect(publish).toHaveBeenCalledTimes(1)
  })

  test('does not start a run once shutdown has begun', async () => {
    const { startOutbox: start, stopOutbox: stop, publishPendingMessages: publish } = await importOutbox()

    // Mirrors a SIGTERM during boot: stopOutbox runs before src/index.js has
    // called startOutbox, so the first run must not start at all.
    await stop()

    await expect(start()).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(120000)

    expect(publish).not.toHaveBeenCalled()
  })

  test('waits for an in-flight run to finish, so it can finalise its claims', async () => {
    const { startOutbox: start, stopOutbox: stop, publishPendingMessages: publish } = await importOutbox()

    let finishRun
    publish.mockImplementationOnce(() => new Promise((resolve) => { finishRun = resolve }))

    const run = start()
    const stopping = trackResolution(stop())

    await vi.advanceTimersByTimeAsync(4999)
    expect(stopping.resolved).toBe(false)

    finishRun()
    await stopping.promise

    expect(stopping.resolved).toBe(true)
    expect(mockLoggerWarn).not.toHaveBeenCalled()
    await run
  })

  test('waits for an in-flight run that fails to settle before resolving', async () => {
    const { startOutbox: start, stopOutbox: stop, publishPendingMessages: publish } = await importOutbox()

    let failRun
    publish.mockImplementationOnce(() => new Promise((resolve, reject) => { failRun = reject }))

    start()
    const stopping = trackResolution(stop())

    await vi.advanceTimersByTimeAsync(4999)
    expect(stopping.resolved).toBe(false)

    failRun(new Error('Test error'))
    await stopping.promise

    expect(stopping.resolved).toBe(true)
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })

  test('abandons a run that outlives the drain timeout, so shutdown cannot hang', async () => {
    const { startOutbox: start, stopOutbox: stop, publishPendingMessages: publish } = await importOutbox()

    // Neither the MongoDB nor the SNS client sets a request timeout, so a run
    // can stall indefinitely. hapi-pulse does not bound preServerStop, so an
    // unbounded wait here would leave the container to be killed.
    publish.mockImplementationOnce(() => new Promise(() => {}))

    start()
    const stopping = trackResolution(stop())

    await vi.advanceTimersByTimeAsync(4999)
    expect(stopping.resolved).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await stopping.promise

    expect(stopping.resolved).toBe(true)
    expect(mockLoggerWarn).toHaveBeenCalledWith(...drainTimeoutLog)
  })

  test('returns without waiting when no run has started', async () => {
    const { stopOutbox: stop, publishPendingMessages: publish } = await importOutbox()

    await expect(stop()).resolves.toBeUndefined()
    expect(publish).not.toHaveBeenCalled()
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })
})
