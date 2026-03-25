import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockInfo = vi.fn()
const mockError = vi.fn()

vi.mock('../../src/logging/logger.js', () => ({
  createLogger: () => ({ info: mockInfo, error: mockError })
}))

const mockStartServer = vi.fn()
const mockStartOutbox = vi.fn()

vi.mock('../../src/api/common/helpers/start-server.js', () => ({ startServer: mockStartServer }))
vi.mock('../../src/messaging/outbound/index.js', () => ({ startOutbox: mockStartOutbox }))

describe('entrypoint index.js', () => {
  beforeEach(() => {
    vi.resetModules()
    mockInfo.mockClear()
    mockError.mockClear()
    mockStartServer.mockResolvedValue(undefined)
    mockStartOutbox.mockResolvedValue(undefined)
    // Ensure we don't accumulate unhandledRejection listeners across tests
    process.removeAllListeners('unhandledRejection')
  })

  test('calls startServer and startOutbox and logs enabled message', async () => {
    await import('../../src/index.js')

    expect(mockStartServer).toHaveBeenCalled()
    expect(mockStartOutbox).toHaveBeenCalled()
    expect(mockInfo).toHaveBeenCalledWith('Outbox processor enabled.')
  })

  test('handles unhandledRejection by logging and setting exit code', async () => {
    // Import the entrypoint which registers the handler
    await import('../../src/index.js')

    const err = new Error('boom')
    process.emit('unhandledRejection', err)

    expect(mockInfo).toHaveBeenCalledWith('Unhandled rejection')
    expect(mockError).toHaveBeenCalledWith(err)
    expect(process.exitCode).toBe(1)
  })
})
