// Test setup: provide minimal environment variables required by convict config
process.env.CDP_UPLOADER_URL = process.env.CDP_UPLOADER_URL || 'http://localhost:3000'
process.env.CDP_UPLOADER_S3_BUCKET = process.env.CDP_UPLOADER_S3_BUCKET || 'test-bucket'
process.env.CDP_UPLOADER_S3_PATH = process.env.CDP_UPLOADER_S3_PATH || 'test/path'
process.env.CDP_UPLOADER_CALLBACK_URL = process.env.CDP_UPLOADER_CALLBACK_URL || 'http://localhost:3000/callback'
process.env.CDP_UPLOADER_MAX_FILE_SIZE = process.env.CDP_UPLOADER_MAX_FILE_SIZE || '10485760'
process.env.MONGO_READ_PREFERENCE = process.env.MONGO_READ_PREFERENCE || 'primary'
// Set the topic ARN used by tests to the expected value
process.env.DOCUMENT_UPLOAD_EVENTS_TOPIC_ARN = 'arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events'

// Other optional defaults to avoid validation failures in tests
process.env.AWS_REGION = process.env.AWS_REGION || 'eu-west-2'
process.env.SNS_ENDPOINT = process.env.SNS_ENDPOINT || 'https://sns.eu-west-2.amazonaws.com'

// AWS credentials and S3 settings used by unit tests
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test'
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test'
process.env.AWS_S3_FORCE_PATH_STYLE = process.env.AWS_S3_FORCE_PATH_STYLE || 'true'
process.env.S3_ENDPOINT = process.env.S3_ENDPOINT || ''

// Ensure the topic ARN matches unit test expectations
process.env.DOCUMENT_UPLOAD_EVENTS_TOPIC_ARN = process.env.DOCUMENT_UPLOAD_EVENTS_TOPIC_ARN || 'arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events'

export { }
