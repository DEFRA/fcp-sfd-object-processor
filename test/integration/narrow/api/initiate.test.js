import { describe, test, expect, afterAll, beforeAll } from 'vitest'
import { createServer } from '../../../../src/api'

describe('/initiate route', () => {
  let server
  let response

  beforeAll(async () => {
    server = await createServer()
    server.initialize()

    response = await server.inject({
      method: 'POST',
      url: '/initiate',
      payload: {
        test: 123
      }
    })
  })

  afterAll(async () => {
    // server.stop()
  })

  describe('/health endpoint for cdp uploader', () => {
    test('returns 200 status', async () => {
      const healthResponse = await fetch('http://cdp-uploader:7337/health')
      expect(healthResponse.status).toBe(200)
    })
  })

  describe('POST with a valid payload', () => {
    test('returns 201 status', () => {
      expect(response.statusCode).toBe(201)
    })

    test('should return the uploadId, uploadUrl and statusUrl', () => {
      const expectedResponse = {
        uploadId: expect.any(String),
        uploadUrl: expect.any(String),
        statusUrl: expect.any(String)
      }
      expect(response.body).toMatchObject(expectedResponse)
    })
  })
})

// Describe - when invalid payload
// should get an error
// seperate tests for schema
