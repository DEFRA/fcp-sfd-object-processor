export const uploaderConfig = {
  uploaderUrl: {
    doc: 'The base URL for the cdp uploader api',
    format: String,
    nullable: false,
    default: null,
    env: 'CDP_UPLOADER_URL'
  }
}
