import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load the OpenAPI specification
const openApiPath = join(__dirname, '../../../../docs/openapi/v1.json')
const openApiSpec = JSON.parse(readFileSync(openApiPath, 'utf8'))

// Expected response codes per endpoint, derived from each route's actual
// behaviour (Joi response.status + handler). The documented contract must only
// advertise responses the handler can genuinely return.
//
// Notes:
// - /api/v1/callback has auth disabled and persists validation failures as 201,
//   so it never returns 401, 404 or 422.
// - /api/v1/status/{correlationId} and /api/v1/uploader/initiate never return 404.
// - No endpoint returns 422 (validation failures are persisted, not rejected).
const expectedResponseCodes = {
  '/api/v1/blob/{fileId}': { get: ['200', '400', '401', '404', '500'] },
  '/api/v1/status/{correlationId}': { get: ['200', '400', '401', '500'] },
  '/api/v1/metadata/sbi/{sbi}': { get: ['200', '400', '401', '404', '500'] },
  '/api/v1/uploader/status/{uploadId}': { get: ['200', '400', '401', '404', '500', '502', '504'] },
  '/api/v1/callback': { post: ['200', '201', '400', '500'] },
  '/api/v1/uploader/initiate': { post: ['200', '400', '401', '500', '502', '504'] }
}

describe('OpenAPI Response Codes', () => {
  describe('API routes advertise only the response codes their handler can return', () => {
    Object.entries(expectedResponseCodes).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, expectedCodes]) => {
        describe(`${method.toUpperCase()} ${path}`, () => {
          test('is present in the OpenAPI spec', () => {
            expect(openApiSpec.paths[path]?.[method]).toBeDefined()
          })

          test('documents exactly the expected response codes', () => {
            const operation = openApiSpec.paths[path][method]
            const actualCodes = Object.keys(operation.responses).sort()
            expect(actualCodes).toEqual([...expectedCodes].sort())
          })

          test('has a 200 or 201 success response', () => {
            const operation = openApiSpec.paths[path][method]
            const hasSuccessResponse = operation.responses['200'] || operation.responses['201']
            expect(hasSuccessResponse).toBeDefined()
          })

          test('has a 400 Bad Request response', () => {
            expect(openApiSpec.paths[path][method].responses['400']).toBeDefined()
          })

          test('has a 500 Internal Server Error response', () => {
            expect(openApiSpec.paths[path][method].responses['500']).toBeDefined()
          })

          test('does not advertise a 422 Unprocessable Entity response', () => {
            expect(openApiSpec.paths[path][method].responses['422']).toBeUndefined()
          })
        })
      })
    })
  })

  describe('Callback endpoint', () => {
    const callback = () => openApiSpec.paths['/api/v1/callback'].post.responses

    test('returns 201 Created on success', () => {
      expect(callback()['201']).toBeDefined()
    })

    test('does not advertise 401 (auth is disabled for this route)', () => {
      expect(callback()['401']).toBeUndefined()
    })

    test('does not advertise 404 (the handler never returns not found)', () => {
      expect(callback()['404']).toBeUndefined()
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
        '/api/v1/status/{correlationId}',
        '/api/v1/uploader/initiate',
        '/api/v1/uploader/status/{uploadId}'
      ]

      expectedRoutes.forEach(route => {
        expect(openApiSpec.paths[route]).toBeDefined()
      })
    })

    test('should include the /api/v1/status endpoint in the OpenAPI spec', () => {
      expect(openApiSpec.paths['/api/v1/status/{correlationId}']).toBeDefined()
    })
  })
})
