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
    s3: {
      endpoint: {
        doc: 'Endpoint for S3 storage (used in non-production environments for Floci).',
        format: String,
        default: '',
        env: 'S3_ENDPOINT'
      },
      forcePathStyle: {
        doc: 'Force path-style (for presigned URLs) for S3 (required for Floci).',
        format: Boolean,
        default: false,
        env: 'AWS_S3_FORCE_PATH_STYLE'
      },
      presignedUrlExpirySeconds: {
        doc: 'Expiry duration in seconds for S3 presigned URLs. Defaults to 300s (5 minutes) to minimise exposure window if a URL is leaked.',
        format: 'int',
        default: 300,
        env: 'S3_PRESIGNED_URL_EXPIRY_SECONDS'
      }
    },
    messaging: {
      topics: {
        documentUploadEvents: {
          doc: 'ARN (Amazon Resource Name) for the document upload SNS topic to which document upload events are published',
          format: String,
          default: null,
          env: 'DOCUMENT_UPLOAD_EVENTS_TOPIC_ARN'
        },
        auditEvents: {
          doc: 'ARN for the audit SNS topic',
          format: String,
          default: null,
          nullable: true,
          env: 'AUDIT_TOPIC_ARN'
        }
      }

    }
  }
}
