export const uploaderConfig = {
  uploaderUrl: {
    doc: 'The base URL for the cdp uploader api',
    format: String,
    nullable: false,
    default: null,
    env: 'CDP_UPLOADER_URL'
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
  }
}
