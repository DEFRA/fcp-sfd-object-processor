import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '../s3/client.js'
import { createLogger } from '../logging/logger.js'
import { config } from '../config/index.js'

const logger = createLogger()

const generatePresignedUrl = async (s3Reference) => {
  try {
    const command = new GetObjectCommand({
      Bucket: s3Reference.bucket,
      Key: s3Reference.key
    })

    const url = await getSignedUrl(s3Client, command, { expiresIn: config.get('aws.s3.presignedUrlExpirySeconds') })

    return { url }
  } catch (err) {
    logger.error(err)
    throw new Error('S3 Unavailable')
  }
}

export { generatePresignedUrl }
