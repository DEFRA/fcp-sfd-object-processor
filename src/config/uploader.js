export const uploaderConfig = {
  uploaderUrl: {
    doc: 'The internal base URL for server-to-server calls to the cdp uploader api',
    format: String,
    nullable: false,
    default: null,
    env: 'CDP_UPLOADER_URL'
  },
  uploaderExternalUrl: {
    doc: 'The external base URL for cdp uploader exposed to browser clients. Falls back to CDP_UPLOADER_URL if not set.',
    format: String,
    nullable: true,
    default: null,
    env: 'CDP_UPLOADER_EXTERNAL_URL'
  },
  uploaderInitiateEndpoint: {
    doc: 'The endpoint path for initiating document scans',
    format: 'endpoint-path',
    nullable: false,
    default: '/initiate',
    env: 'CDP_UPLOADER_INITIATE_ENDPOINT'
  },
  uploaderStatusEndpoint: {
    doc: 'The endpoint path for checking scan completion status',
    format: 'endpoint-path',
    nullable: false,
    default: '/status',
    env: 'CDP_UPLOADER_STATUS_ENDPOINT'
  },
  cdpUploaderS3Bucket: {
    doc: 'The S3 bucket name for CDP Uploader file storage',
    format: String,
    nullable: false,
    default: null,
    env: 'CDP_UPLOADER_S3_BUCKET'
  },
  cdpUploaderS3Path: {
    doc: 'The S3 path prefix for CDP Uploader file storage',
    format: String,
    nullable: false,
    default: null,
    env: 'CDP_UPLOADER_S3_PATH'
  },
  cdpUploaderCallbackUrl: {
    doc: 'The callback URL CDP Uploader will call after processing',
    format: String,
    nullable: false,
    default: null,
    env: 'CDP_UPLOADER_CALLBACK_URL'
  },
  cdpUploaderMimeTypes: {
    doc: 'Comma-separated list of allowed MIME types for uploads',
    format: 'mime-type-array',
    default: [],
    env: 'CDP_UPLOADER_MIME_TYPES'
  },
  cdpUploaderMaxFileSize: {
    doc: 'Maximum file size in bytes allowed for uploads',
    format: Number,
    nullable: false,
    default: null,
    env: 'CDP_UPLOADER_MAX_FILE_SIZE'
  },
  cdpUploaderTimeoutMs: {
    doc: 'Timeout in milliseconds for CDP Uploader requests',
    format: Number,
    nullable: false,
    default: 30000,
    env: 'CDP_UPLOADER_TIMEOUT_MS'
  },
  cdpUploaderDocumentTypes: {
    doc: 'Comma-separated list of allowed document type values for the type field',
    format: 'document-type-array',
    default: [],
    env: 'CDP_UPLOADER_DOCUMENT_TYPES'
  }
}
