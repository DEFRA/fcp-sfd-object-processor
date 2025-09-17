export const mockMetadataPayload = {
  uploadStatus: 'ready',
  metadata: {
    crn: '1050000000',
    sbi: '105000000',
    service: 'SFD'
    // need to return the URL for the file download
  },
  form: {
    'a-form-field': 'some value',
    'a-file-upload-field': {
      fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      filename: 'dragon-b.jpeg',
      contentType: 'image/jpeg',
      fileStatus: 'complete',
      contentLength: 11264,
      checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
      detectedContentType: 'image/jpeg',
      s3Key: '3b0b2a02-a669-44ba-9b78-bd5cb8460253/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      s3Bucket: 'cdp-example-node-frontend'
    },
    'another-form-field': 'foobazbar'
  },
  numberOfRejectedFiles: 0
}
