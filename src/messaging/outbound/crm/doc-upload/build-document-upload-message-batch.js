export const buildDocumentUploadMessageBatch = (pendingMessages) => {
  return pendingMessages.map(message => {
    const { metadata, file } = message.payload

    const uploadDate = new Date(metadata.submissionDateTime).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })

    const title = `${metadata.reference} - CRN ${metadata.crn} - ${uploadDate}`

    return {
      id: message.messageId, // use messageId for idempotency, mongo ObjectId string
      source: 'fcp-sfd-object-processor',
      specversion: '1.0',
      type: 'uk.gov.fcp.sfd.event',
      subject: 'document.uploaded',
      datacontenttype: 'application/json',
      time: new Date().toISOString(),
      data: {
        crn: metadata.crn,
        crm: {
          caseType: metadata.type,
          title
        },
        correlationId: 'placeholder-correlation-id', // TODO: Generate correlation ID when persisting UploadMetadata and pass it in here
        file: {
          fileId: file.fileId,
          fileName: file.filename,
          contentType: file.contentType,
          url: `https://example.com/files/${file.fileId}` // if we send a presigned url it will expire, API link to retrieve file instead?
        },
        sbi: metadata.sbi,
        sourceSystem: metadata.service, // do we need to map this to something else?
        submissionId: metadata.submissionId
      }
    }
  })
}

// message
// {
//   raw: {
//     uploadStatus: "ready",
//     numberOfRejectedFiles: 0,
//     fileId: "6083c868-aa8c-4eb7-976d-8baa529c454a",
//     filename: "upload-example-1.jpg",
//     contentType: "image/jpeg",
//     fileStatus: "complete",
//     contentLength: 264542,
//     checksumSha256: "1bj9oQOQnHo3m4IH8XC46J2nZxDg+qtJN0QdvV/wrMo=",
//     detectedContentType: "image/jpeg",
//     s3Key: "scanned/9a308a0c-611d-48f6-a358-22a6f7efe353/6083c868-aa8c-4eb7-976d-8baa529c454a",
//     s3Bucket: "fcp-sfd-object-processor-bucket",
//   },
//   metadata: {
//     sbi: "105000000",
//     crn: "1050000000",
//     frn: "1102658375",
//     submissionId: "1733826312",
//     uosr: "107220150_1733826312",
//     submissionDateTime: "10/12/2024 10:25:12",
//     files: [
//       "107220150_1733826312_SBI107220150.pdf",
//     ],
//     filesInSubmission: 2,
//     type: "CS_Agreement_Evidence",
//     reference: "user entered reference",
//     service: "SFD",
//   },
//   file: {
//     fileId: "6083c868-aa8c-4eb7-976d-8baa529c454a",
//     filename: "upload-example-1.jpg",
//     contentType: "image/jpeg",
//     fileStatus: "complete",
//   },
//   s3: {
//     key: "scanned/9a308a0c-611d-48f6-a358-22a6f7efe353/6083c868-aa8c-4eb7-976d-8baa529c454a",
//     bucket: "fcp-sfd-object-processor-bucket",
//   },
//   messaging: {
//     publishedAt: null,
//   },
//   _id: {
//     buffer: new Uint8Array([105, 112, 227, 195, 83, 131, 102, 48, 37, 227, 172, 227]),
//   },
// }
