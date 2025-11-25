import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import process from 'node:process'

import { createLogger } from '../../src/logging/logger.js'
import { startServer } from '../../src/api/common/helpers/start-server.js'
import { generateOpenapi } from '../../src/api/common/helpers/generate-openapi.js'

vi.mock('../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('../../src/api/common/helpers/start-server.js', () => ({
  startServer: vi.fn()
}))

vi.mock('../../src/api/common/helpers/generate-openapi.js', () => ({
  generateOpenapi: vi.fn()
}))

const mockLogger = createLogger()
const mockServer = { mock: 'server' }

describe('#index - OpenAPI generation', () => {
  let originalEnv

  beforeEach(() => {
    vi.clearAllMocks()
    originalEnv = process.env.NODE_ENV
    startServer.mockResolvedValue(mockServer)
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    vi.resetModules()
  })

  describe('When NODE_ENV is not production', () => {
    test('Should generate OpenAPI when in development mode.', async () => {
      process.env.NODE_ENV = 'development'

      await import('../../src/index.js?t=' + Date.now())

      expect(mockLogger.info).toHaveBeenCalledWith('Running in development mode')
      expect(mockLogger.info).toHaveBeenCalledWith('Generating OpenAPI documentation')
      expect(generateOpenapi).toHaveBeenCalledWith(mockServer)
    })

    test('Should generate OpenAPI when in test mode.', async () => {
      process.env.NODE_ENV = 'test'

      await import('../../src/index.js?t=' + Date.now())

      expect(mockLogger.info).toHaveBeenCalledWith('Generating OpenAPI documentation')
      expect(mockLogger.info).toHaveBeenCalledWith('Running in development mode')
      expect(generateOpenapi).toHaveBeenCalledWith(mockServer)
    })

    test('Should generate OpenAPI when NODE_ENV is not set', async () => {
      delete process.env.NODE_ENV

      await import('../../src/index.js?t=' + Date.now())

      expect(mockLogger.info).toHaveBeenCalledWith('Running in development mode')
      expect(mockLogger.info).toHaveBeenCalledWith('Generating OpenAPI documentation')
      expect(generateOpenapi).toHaveBeenCalledWith(mockServer)
    })
  })

  describe('When NODE_ENV is production', () => {
    test('Should not generate OpenAPI', async () => {
      process.env.NODE_ENV = 'production'

      await import('../../src/index.js?t=' + Date.now())

      expect(mockLogger.info).not.toHaveBeenCalledWith('Running in development mode')
      expect(mockLogger.info).not.toHaveBeenCalledWith('Generating OpenAPI documentation')
      expect(generateOpenapi).not.toHaveBeenCalled()
    })
  })
})
