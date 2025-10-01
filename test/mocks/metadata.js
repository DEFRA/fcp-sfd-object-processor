export const mockFormattedMetadata =
[
  {
    metadata: {
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
    },
    file: {
      fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
      filename: 'dragon-b.jpeg',
      contentType: 'image/jpeg',
      fileStatus: 'complete'
    }
  },
  {
    metadata: {
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
    },
    file: {
      fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554',
      filename: 'Health and Safety Assessment Certificate.pdf',
      contentType: 'application/pdf',
      fileStatus: 'complete'
    }
  }
]

export const mockRawData = {
  raw: {
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
}

export const mockS3Data = {
  s3: {
    key: '3b0b2a02-a669-44ba-9b78-bd5cb8460253/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
    bucket: 'cdp-example-node-frontend'
  }
}
