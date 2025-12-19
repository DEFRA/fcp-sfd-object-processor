// an example of the metadata that is provided by a consuming service
const mockMetadata = {
  sbi: '105000000',
  crn: '1050000000',
  frn: '1102658375',
  submissionId: '1733826312',
  uosr: '107220150_1733826312',
  submissionDateTime: '10/12/2024 10:25:12',
  files: ['107220150_1733826312_SBI107220150.pdf'],
  filesInSubmission: 2,
  type: 'CS_Agreement_Evidence',
  reference: 'user entered reference',
  service: 'SFD'
}

// examples of the file upload data that is returned from the cdp uploader for each file uploaded, this forms part of the scanAndUploadResponse
const mockFormField = {
  fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
  filename: 'dragon-b.jpeg',
  contentType: 'image/jpeg',
  fileStatus: 'complete',
  contentLength: 11264,
  checksumSha256: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
  detectedContentType: 'image/jpeg',
  s3Key: '3b0b2a02-a669-44ba-9b78-bd5cb8460253/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
  s3Bucket: 'cdp-example-node-frontend'
}

const anotherMockFormField = {
  fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554',
  filename: 'Health and Safety Assessment Certificate.pdf',
  contentType: 'application/pdf',
  fileStatus: 'complete',
  contentLength: 115307,
  checksumSha256: 'ZbILFUsbS2Pio0Sv2ifwyg+SSQsnzVF1h6fQzAiBt4Q=',
  detectedContentType: 'application/pdf',
  s3Key: 'scanned/8ea63b47-f5ac-410e-8b1c-3ae522b0a96c/3f90b889-eac7-4e98-975f-93fcef5b8554',
  s3Bucket: 'fcp-sfd-object-processor-bucket'
}

// Mock of the full response from the cdp uploader scanAndUpload endpoint
// NOTE this can include file upload data or text data. confirm what our consumers will/can/should send.
export const mockScanAndUploadResponse = {
  uploadStatus: 'ready',
  metadata: mockMetadata,
  form: {
    'a-file-upload-field': mockFormField,
    'another-file-upload-field': anotherMockFormField,
    'a-form-field': 'not a file upload some other value', // example of non upload data
    'another-form-field': 'another value that is not a file upload'
  },
  numberOfRejectedFiles: 0
}

// this should be replaced and/or renamed as its use is for inserting multiple documents into the db but they will be the wrong format now.
export const mockScanAndUploadResponseArray = [
  mockScanAndUploadResponse,
  {
    _id: 'unique id 1',
    ...mockScanAndUploadResponse
  },
  {
    ...mockScanAndUploadResponse,
    _id: 'unique id 2',
    metadata: {
      sbi: '105000001'
    }
  }

]
