import { ObjectId } from 'mongodb'

const mockPendingMessageOne = {
  _id: ObjectId.createFromHexString('6970ef40eb614141dffe78cb'),
  messageId: ObjectId.createFromHexString('6970ef40eb614141dffe78c6'),
  payload: {
    raw: {
      uploadStatus: 'ready',
      numberOfRejectedFiles: 0,
      fileId: '693db079-f82b-4bbc-87e9-86d822cc0bad',
      filename: 'upload-example-5.png',
      contentType: 'image/png',
      fileStatus: 'complete',
      contentLength: 338195,
      checksumSha256: 'WzfoGsFx/lsHpqGG8KGErp+w7+T5MvkDKt5dZlcOqAc=',
      detectedContentType: 'image/png',
      s3Key: 'scanned/85a50fa1-3d1d-46b7-a9eb-b72fc9d97031/693db079-f82b-4bbc-87e9-86d822cc0bad',
      s3Bucket: 'dev-fcp-sfd-object-processor-bucket-c63f2'
    },
    metadata: {
      sbi: '105000000',
      crn: '1050000000',
      frn: '1102658375',
      submissionId: '1733826312',
      uosr: '107220150_1733826312',
      submissionDateTime: '31/12/2024 10:25:12',
      files: ['107220150_1733826312_SBI107220150.pdf'],
      filesInSubmission: 2,
      type: 'CS_Agreement_Evidence',
      reference: 'user entered reference',
      service: 'SFD'
    },
    file: {
      fileId: '693db079-f82b-4bbc-87e9-86d822cc0bad',
      filename: 'upload-example-5.png',
      contentType: 'image/png',
      fileStatus: 'complete'
    },
    s3: {
      key: 'scanned/85a50fa1-3d1d-46b7-a9eb-b72fc9d97031/693db079-f82b-4bbc-87e9-86d822cc0bad',
      bucket: 'dev-fcp-sfd-object-processor-bucket-c63f2'
    },
    messaging: {
      publishedAt: null,
      correlationId: '123e4567-e89b-12d3-a456-426655440000'
    },
    _id: ObjectId.createFromHexString('6970ef40eb614141dffe78c6')
  },
  status: 'PENDING',
  attempts: 1,
  createdAt: '2026-01-21T15:22:40.280Z',
  lastAttemptedAt: '2026-01-21T15:22:59.407Z'
}

const mockPendingMessageTwo = {
  _id: ObjectId.createFromHexString('6970ef40eb614141dffe78cd'),
  messageId: ObjectId.createFromHexString('6970ef40eb614141dffe78c7'),
  payload: {
    raw: {
      uploadStatus: 'ready',
      numberOfRejectedFiles: 0,
      fileId: '8a4fc18e-2c3d-4e5f-b7a2-9d3e6f8c1b4a',
      filename: 'agreement-document.pdf',
      contentType: 'application/pdf',
      fileStatus: 'complete',
      contentLength: 524288,
      checksumSha256: 'XyBpHtGkY/mnRpFH9LHFqr+x8+U6NwlELu6eAmdPrBd=',
      detectedContentType: 'application/pdf',
      s3Key: 'scanned/85a50fa1-3d1d-46b7-a9eb-b72fc9d97031/8a4fc18e-2c3d-4e5f-b7a2-9d3e6f8c1b4a',
      s3Bucket: 'dev-fcp-sfd-object-processor-bucket-c63f2'
    },
    metadata: {
      sbi: '205000000',
      crn: '2050000000',
      frn: '2102658375',
      submissionId: '1733826314',
      uosr: '107220150_1733826312',
      submissionDateTime: '10/12/2024 10:25:12',
      files: ['107220150_1733826312_SBI107220150.pdf'],
      filesInSubmission: 2,
      type: 'CS_Agreement_Evidence',
      reference: 'user entered reference',
      service: 'SFD'
    },
    file: {
      fileId: '8a4fc18e-2c3d-4e5f-b7a2-9d3e6f8c1b4a',
      filename: 'agreement-document.pdf',
      contentType: 'application/pdf',
      fileStatus: 'complete'
    },
    s3: {
      key: 'scanned/85a50fa1-3d1d-46b7-a9eb-b72fc9d97031/8a4fc18e-2c3d-4e5f-b7a2-9d3e6f8c1b4a',
      bucket: 'dev-fcp-sfd-object-processor-bucket-c63f2'
    },
    messaging: {
      publishedAt: null,
      correlationId: '123e4567-e89b-12d3-a456-426655440001'
    },
    _id: ObjectId.createFromHexString('6970ef40eb614141dffe78c7')
  },
  status: 'PENDING',
  attempts: 1,
  createdAt: '2026-01-21T15:22:45.120Z',
  lastAttemptedAt: '2026-01-21T15:23:02.335Z'
}

const mockPendingMessages = [mockPendingMessageOne, mockPendingMessageTwo]

export { mockPendingMessages }
