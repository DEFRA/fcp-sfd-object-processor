import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load the OpenAPI specification
const openApiPath = join(__dirname, '../../../../docs/openapi/v1.json')
const openApiSpec = JSON.parse(readFileSync(openApiPath, 'utf8'))

describe('OpenAPI Response Codes', () => {
  describe('API routes should have standard response codes', () => {
    const apiPaths = Object.entries(openApiSpec.paths).filter(([path]) => path.startsWith('/api/'))

    apiPaths.forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, operation]) => {
        if (!operation.responses) return

        describe(`${method.toUpperCase()} ${path}`, () => {
          test('should have 200 or 201 success response', () => {
            const hasSuccessResponse = operation.responses['200'] || operation.responses['201']
            expect(hasSuccessResponse).toBeDefined()
          })

          test('should have 400 Bad Request response', () => {
            expect(operation.responses['400']).toBeDefined()
          })

          test('should have 401 Unauthorized response', () => {
            expect(operation.responses['401']).toBeDefined()
          })

          test('should have 404 Not Found response', () => {
            expect(operation.responses['404']).toBeDefined()
          })

          test('should have 500 Internal Server Error response', () => {
            expect(operation.responses['500']).toBeDefined()
          })

          if (path === '/api/v1/callback') {
            test('callback endpoint should have 422 Unprocessable Entity response', () => {
              expect(operation.responses['422']).toBeDefined()
            })
          } else {
            test('non-callback endpoints should NOT have 422 response', () => {
              expect(operation.responses['422']).toBeUndefined()
            })
          }
        })
      })
    })
  })

  describe('Health endpoint', () => {
    test('should have default response', () => {
      const healthPath = openApiSpec.paths['/health']
      expect(healthPath).toBeDefined()
      expect(healthPath.get.responses.default).toBeDefined()
    })

    test('should not require standard error responses', () => {
      const healthPath = openApiSpec.paths['/health']
      expect(healthPath.get.responses['400']).toBeUndefined()
      expect(healthPath.get.responses['401']).toBeUndefined()
      expect(healthPath.get.responses['404']).toBeUndefined()
      expect(healthPath.get.responses['500']).toBeUndefined()
    })
  })

  describe('Response code coverage', () => {
    test('all API endpoints should be covered', () => {
      const expectedRoutes = [
        '/api/v1/blob/{fileId}',
        '/api/v1/callback',
        '/api/v1/metadata/sbi/{sbi}',
        '/api/v1/status/{correlationId}'
      ]

      expectedRoutes.forEach(route => {
        expect(openApiSpec.paths[route]).toBeDefined()
      })
    })
  })
})
