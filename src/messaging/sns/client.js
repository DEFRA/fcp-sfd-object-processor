import environments from '../../constants/environments.js'

import { SNSClient } from '@aws-sdk/client-sns'

import { config } from '../../config/index.js'

const snsConfig = {
  endpoint: config.get('s3.localstack.endpoint'),
  region: config.get('aws.region')
}

if (config.get('env') !== environments.PRODUCTION) {
  snsConfig.credentials = {
    accessKeyId: config.get('s3.localstack.credentials.accessKeyId'),
    secretAccessKey: config.get('s3.localstack.credentials.secretAccessKey')
  }
}

const snsClient = new SNSClient(snsConfig)

export { snsClient }
