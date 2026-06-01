import environments from '../constants/environments.js'

import { S3Client } from '@aws-sdk/client-s3'

import { config } from '../config/index.js'

const s3Config = {
  region: config.get('aws.region')
}

if (config.get('env') !== environments.PRODUCTION) {
  s3Config.endpoint = config.get('aws.s3.endpoint')
  s3Config.forcePathStyle = config.get('aws.s3.forcePathStyle')
  s3Config.credentials = {
    accessKeyId: config.get('aws.accessKeyId'),
    secretAccessKey: config.get('aws.secretAccessKey')
  }
}

const s3Client = new S3Client(s3Config)

export { s3Client }
