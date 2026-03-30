export const awsConfig = {
  aws: {
    region: {
      doc: 'AWS Region',
      format: String,
      default: 'eu-west-2',
      env: 'AWS_REGION'
    },
    snsEndpoint: {
      doc: 'AWS SNS (Simple Notification Service) Endpoint',
      format: String,
      default: 'https://sns.eu-west-2.amazonaws.com',
      env: 'SNS_ENDPOINT'
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
    local: {
      s3Endpoint: {
        doc: 'Endpoint to use to reach the S3 storage when using a local AWS emulator (Floci).',
        format: String,
        default: '',
        env: 'S3_ENDPOINT'
      },
      forcePathStyle: {
        doc: 'Sets the presigned URL path for S3 to use a defined endpoint instead of the default AWS endpoint, needed for local AWS emulation.',
        format: Boolean,
        default: false,
        env: 'AWS_S3_FORCE_PATH_STYLE'
      }
    },
    messaging: {
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
