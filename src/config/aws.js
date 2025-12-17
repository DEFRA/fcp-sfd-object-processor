export const awsConfig = {
  aws: {
    region: {
      doc: 'AWS Region',
      format: String,
      default: 'eu-west-2',
      env: 'AWS_REGION'
    },
    accessKeyId: {
      doc: 'AWS Access Key ID',
      format: String,
      default: null,
      nullable: true,
      env: 'AWS_ACCESS_KEY_ID'
    },
    secretAccessKey: {
      doc: 'AWS Secret Access Key',
      format: String,
      default: null,
      nullable: true,
      env: 'AWS_SECRET_ACCESS_KEY'
    },
    localstack: {
      s3Endpoint: {
        doc: 'Endpoint to use to reach the s3 storage when using localstack.',
        format: String,
        default: 'http://localhost:4566',
      },
      snsEndpoint: {
        doc: 'Endpoint to send sns messages to when using localstack ',
        format: String,
        default: 'http://localstack:4566',
      },
      forcePathStyle: {
        doc: 'Sets the presigned url path for S3 to use a defined endpoint instead of the default aws endpoint, needed for localstack.',
        format: Boolean,
        default: false,
        env: 'AWS_S3_FORCE_PATH_STYLE'
      }
    },
    messaging: {
      snsEndpoint: {
        doc: 'AWS SNS (Simple Notification Service) Endpoint',
        format: String,
        default: 'https://sns.eu-west-2.amazonaws.com',
        env: 'SNS_ENDPOINT'
      },
      topics: {
        documentUploadEvents: {
          doc: 'ARN (Amazon Resource Name) for the document upload SNS topic to which document upload events are published',
          format: String,
          default: null,
          env: 'DOCUMENT_UPLOAD_EVENTS_TOPIC_ARN'
        }
      }

    }
  }
}
