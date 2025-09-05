import { constants as httpConstants } from 'node:http2'
import { describe, test, expect, afterAll, beforeAll } from 'vitest'
import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'

describe('/initiate route', () => {
  let server
  let validResponse

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()

    validResponse = await server.inject({
      method: 'POST',
      url: '/initiate',
      payload: {
        redirect: 'https://myservice.com/redirect',
        callback: 'https://myservice.com/callback',
        s3Bucket: 'fcp-sfd-object-processor-bucket',
        s3Path: 'scanned',
        metadata: {
          customerId: '1234',
          accountId: '1234'
        }
      }
    })
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('/health endpoint for cdp uploader', () => {
    test('returns 200 status', async () => {
      const healthResponse = await fetch(`${config.get('uploaderUrl')}/health`)
      expect(healthResponse.status).toBe(httpConstants.HTTP_STATUS_OK)
    })
  })

  describe('POST with a valid payload', () => {
    test('should return 201 status', () => {
      expect(validResponse.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)
    })

    test('should return the uploadId, uploadUrl and statusUrl', () => {
      const jsonResponse = JSON.parse(validResponse.payload)
      const expectedResponse = {
        uploadId: expect.any(String),
        uploadUrl: expect.any(String),
        statusUrl: expect.any(String)
      }

      expect(jsonResponse).toMatchObject(expectedResponse)
    })

    test('should return uploadId as a valid uuid4', () => {
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      const jsonResponse = JSON.parse(validResponse.payload)

      expect(jsonResponse.uploadId).toMatch(uuidV4Regex)
    })

    test('should return uploadUrl and statusUrl with correct uploadId', () => {
      const baseUrl = 'http://localhost:7337'
      const jsonResponse = JSON.parse(validResponse.payload)

      expect(jsonResponse.uploadUrl).toMatch(`${baseUrl}/upload-and-scan/${jsonResponse.uploadId}`)
      expect(jsonResponse.statusUrl).toMatch(`${baseUrl}/status/${jsonResponse.uploadId}`)
    })
  })
})

// Describe - when invalid payload
// should get an error
// seperate tests for schema
