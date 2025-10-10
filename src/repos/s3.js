import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../config/index.js'
import { createLogger } from '../logging/logger.js'

const logger = createLogger()
const clientConfig = config.get('s3')

const generatePresignedUrl = async (s3Reference) => {
  const client = new S3Client({
    region: clientConfig.region,
    ...(process.env.NODE_ENV === 'development' ? clientConfig.localstack : {}) // creates a valid s3 client when running locally
  })

  try {
    const command = new GetObjectCommand({
      Bucket: s3Reference.bucket,
      Key: s3Reference.key
    })

    const url = await getSignedUrl(client, command, { expiresIn: 3600 })

    return { url }
  } catch (err) {
    logger.error(err)
    throw new Error('S3 Unavailable')
  }
}

export { generatePresignedUrl }
