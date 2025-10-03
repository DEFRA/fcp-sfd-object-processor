import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../config'

const clientConfig = config.get('s3')

const generatePresignedUrl = async (s3Reference) => {
  const client = new S3Client({
    region: clientConfig.region,
    ...(process.env.NODE_ENV === 'development' ? clientConfig.localstack : {}) // creates a valid s3 client when running locally
  })

  const command = new GetObjectCommand({
    Bucket: s3Reference.bucket,
    Key: s3Reference.key
  })

  const url = await getSignedUrl(client, command, { expiresIn: 3600 })

  return { url }
}

export { generatePresignedUrl }
