// s3Service.test.js
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { generatePresignedUrl } from '../../../../src/repos/s3.js'
import * as presigner from '@aws-sdk/s3-request-presigner'

vi.mock('@aws-sdk/s3-request-presigner')
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  GetObjectCommand: vi.fn(),
}))

describe('When generatePresignedUrl is called', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should return a signed URL when successful', async () => {
    presigner.getSignedUrl.mockResolvedValueOnce('https://example.com/signed')

    const url = await generatePresignedUrl('my-bucket', 'file.txt')

    expect(presigner.getSignedUrl).toHaveBeenCalledOnce()
    expect(url).toStrictEqual({ url: 'https://example.com/signed' })
  })

  test('should throw S3Unavailable when AWS SDK fails', async () => {
    presigner.getSignedUrl.mockRejectedValueOnce(new Error('AWS error'))

    await expect(generatePresignedUrl('my-bucket', 'file.txt')).rejects.toThrow('S3 Unavailable')
  })
})
