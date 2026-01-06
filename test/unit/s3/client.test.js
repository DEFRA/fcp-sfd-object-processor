import { afterEach, beforeAll, beforeEach, describe, expect, vi, test } from 'vitest'

const S3Client = vi.fn()

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client
  }
})

const s3Endpoint = process.env.S3_ENDPOINT

describe('S3 Client', () => {
  let originalEnv

  beforeAll(() => {
    originalEnv = process.env
  })

  beforeEach(async () => {
    vi.resetModules()
  })

  test('should create S3 client with access/secret key in development', async () => {
    process.env.NODE_ENV = 'development'

    const { s3Client } = await import('../../../src/s3/client.js')

    expect(s3Client).toBeDefined()
    expect(S3Client).toHaveBeenCalledWith({
      endpoint: s3Endpoint,
      region: 'eu-west-2',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      }
    })
  })

  test('should create S3 client with only region key in production', async () => {
    process.env.NODE_ENV = 'production'

    const { s3Client } = await import('../../../src/s3/client.js')

    expect(s3Client).toBeDefined()
    expect(S3Client).toHaveBeenCalledWith({
      region: 'eu-west-2'
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })
})
