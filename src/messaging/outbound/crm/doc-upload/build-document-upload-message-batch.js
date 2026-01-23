export const buildDocumentUploadMessageBatch = (pendingMessages) => {
  return pendingMessages.map(message => {
    const { metadata, file, messaging } = message.payload

    // Parse DD/MM/YYYY HH:mm:ss format
    const [datePart] = metadata.submissionDateTime.split(' ')
    const [day, month, year] = datePart.split('/')
    const uploadDate = `${day}/${month}/${year}`

    const title = `${metadata.reference} - CRN ${metadata.crn} - ${uploadDate}`

    return {
      id: message.messageId, // use messageId for idempotency, mongo ObjectId string
      source: 'fcp-sfd-object-processor',
      specversion: '1.0',
      type: 'uk.gov.fcp.sfd.document.uploaded',
      datacontenttype: 'application/json',
      time: new Date().toISOString(),
      data: {
        crn: metadata.crn,
        crm: {
          caseType: metadata.type,
          title
        },
        correlationId: messaging.correlationId,
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
