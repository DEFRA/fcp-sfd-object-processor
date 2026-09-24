import { vi, describe, test, expect, beforeAll, beforeEach } from 'vitest'

import { config } from '../../../../../src/config/index.js'
import { createLogger } from '../../../../../src/logging/logger.js'
import { createServer } from '../../../../../src/api/index.js'
import { startServer } from '../../../../../src/api/common/helpers/start-server.js'

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('../../../../../src/api/index.js', () => ({
  createServer: vi.fn()
}))

const mockLogger = createLogger()

const mockServer = {
  start: vi.fn(),
  stop: vi.fn(),
  logger: mockLogger,
  secureContext: {}
}

describe('#startServer', () => {
  beforeAll(async () => {
    config.set('port', 3098)

    createServer.mockResolvedValue(mockServer)
  })

  describe('When server starts', () => {
    test('Should start up server as expected', async () => {
      await startServer()

      expect(createServer).toHaveBeenCalled()

      expect(mockLogger.info).toHaveBeenNthCalledWith(
        1,
        'Server started successfully'
      )
      expect(mockLogger.info).toHaveBeenNthCalledWith(
        2,
        'Access your backend on http://localhost:3098'
      )
    })
  })

  describe('When server start fails', () => {
    beforeAll(() => {
      createServer.mockRejectedValue(Error('Server failed to start'))
    })

    // Cleared per test so the assertions below can pin the exact call rather than
    // matching one left behind by an earlier test in this file.
    beforeEach(() => {
      mockLogger.error.mockClear()
    })

    test('Should reject so the process does not continue without a server', async () => {
      await expect(startServer()).rejects.toThrow('Server failed to start')
    })

    test('Should log the failure with the error under err and approved ECS event fields', async () => {
      const startError = new Error('Server failed to start')
      createServer.mockRejectedValueOnce(startError)

      await expect(startServer()).rejects.toBe(startError)

      expect(mockLogger.error).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).toHaveBeenCalledWith({
        err: startError,
        event: {
          type: 'server_start',
          action: 'start',
          outcome: 'failure'
        }
      }, 'Server failed to start')
    })

    test('Should leave error.type, error.message and error.stack_trace to the ECS serialiser', async () => {
      await expect(startServer()).rejects.toThrow()

      const [logContext] = mockLogger.error.mock.calls[0]

      expect(logContext).not.toHaveProperty('error')
    })
  })
})
