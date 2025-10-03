import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const generatePresignedUrl = async (s3Reference) => {
  const client = new S3Client({
    region: 'eu-west-2',
    endpoint: 'http://localhost:4566',
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test'
    },
    forcePathStyle: true
  })

  const command = new GetObjectCommand({
    Bucket: s3Reference.bucket,
    Key: s3Reference.key
  })

  const url = await getSignedUrl(client, command, { expiresIn: 3600 })

  return { url }
}

export { generatePresignedUrl }
