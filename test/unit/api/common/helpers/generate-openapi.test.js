import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { writeFile } from 'node:fs/promises'
import yaml from 'js-yaml'

import { generateOpenapi } from '../../../../../src/api/common/helpers/generate-openapi.js'
import { createLogger } from '../../../../../src/logging/logger.js'

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn()
}))

vi.mock('js-yaml', () => ({
  default: {
    dump: vi.fn()
  }
}))

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn()
  })
}))

const mockLogger = createLogger()

describe('Generates OpenAPI documentation', () => {
  const mockOpenApiJson = {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {}
  }

  const mockYamlOutput = 'openapi: 3.0.0\ninfo:\n  title: Test API\n  version: 1.0.0\npaths: {}'

  let mockServer

  beforeEach(() => {
    vi.clearAllMocks()

    mockServer = {
      inject: vi.fn().mockResolvedValue({
        result: mockOpenApiJson
      })
    }

    yaml.dump.mockReturnValue(mockYamlOutput)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('When generation succeeds', () => {
    test('Should call server.inject with correct parameters', async () => {
      await generateOpenapi(mockServer)

      expect(mockServer.inject).toHaveBeenCalledWith({
        method: 'GET',
        url: '/documentation.json'
      })
    })

    test('Should convert JSON to YAML', async () => {
      await generateOpenapi(mockServer)

      expect(yaml.dump).toHaveBeenCalledWith(mockOpenApiJson)
    })

    test('Should write file to default path', async () => {
      await generateOpenapi(mockServer)

      expect(writeFile).toHaveBeenCalledWith('./src/docs/openapi/v1.yaml', mockYamlOutput)
    })

    test('Should write file to custom path', async () => {
      const customPath = './custom/path/openapi.yaml'
      await generateOpenapi(mockServer, customPath)

      expect(writeFile).toHaveBeenCalledWith(customPath, mockYamlOutput)
    })

    test('Should log success message with default path', async () => {
      await generateOpenapi(mockServer)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'OpenAPI documentation generated successfully at ./src/docs/openapi/v1.yaml'
      )
    })

    test('Should log success message with custom path', async () => {
      const customPath = './custom/path/openapi.yaml'
      await generateOpenapi(mockServer, customPath)

      expect(mockLogger.info).toHaveBeenCalledWith(
        `OpenAPI documentation generated successfully at ${customPath}`
      )
    })
  })

  describe('When server.inject fails', () => {
    const mockError = new Error('Failed to get documentation')

    beforeEach(() => {
      mockServer.inject.mockRejectedValue(mockError)
    })

    test('Should log error', async () => {
      await expect(generateOpenapi(mockServer)).rejects.toThrow(mockError)

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate OpenAPI documentation:',
        mockError
      )
    })

    test('Should throw error', async () => {
      await expect(generateOpenapi(mockServer)).rejects.toThrow(
        'Failed to get documentation'
      )
    })

    test('Should not write file', async () => {
      await expect(generateOpenapi(mockServer)).rejects.toThrow()

      expect(writeFile).not.toHaveBeenCalled()
    })
  })

  describe('When yaml.dump fails', () => {
    const mockError = new Error('Failed to convert to YAML')

    beforeEach(() => {
      yaml.dump.mockImplementation(() => {
        throw mockError
      })
    })

    test('Should log error', async () => {
      await expect(generateOpenapi(mockServer)).rejects.toThrow(mockError)

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate OpenAPI documentation:',
        mockError
      )
    })

    test('Should throw error', async () => {
      await expect(generateOpenapi(mockServer)).rejects.toThrow(
        'Failed to convert to YAML'
      )
    })

    test('Should not write file', async () => {
      await expect(generateOpenapi(mockServer)).rejects.toThrow()

      expect(writeFile).not.toHaveBeenCalled()
    })
  })

  describe('When writeFile fails', () => {
    const mockError = new Error('Failed to write file')

    beforeEach(() => {
      writeFile.mockRejectedValue(mockError)
    })

    test('Should log error', async () => {
      await expect(generateOpenapi(mockServer)).rejects.toThrow(mockError)

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate OpenAPI documentation:',
        mockError
      )
    })

    test('Should throw error', async () => {
      await expect(generateOpenapi(mockServer)).rejects.toThrow(
        'Failed to write file'
      )
    })
  })
})
