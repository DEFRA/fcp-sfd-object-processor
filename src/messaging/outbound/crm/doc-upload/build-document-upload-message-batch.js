import { config } from '../../../../config/index.js'

export const buildDocumentUploadMessageBatch = (pendingMessages) => {
  const baseUrl = config.get('publicApiBaseUrl')

  return pendingMessages.map(message => {
    const { metadata, file, messaging } = message.payload

    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = now.getFullYear()
    const uploadDate = `${day}/${month}/${year}`

    const title = `${metadata.reference} - CRN ${metadata.crn} - ${uploadDate}`

    return {
      id: file.fileId,
      // using fileId for idempotency, uuid.
      // This can be used for idempotency in downstream services and ties back to fileId created at upload and to the document metadata stored in the DB.
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
          url: `${baseUrl}/api/v1/blobs/${file.fileId}`
        },
        sbi: metadata.sbi,
        sourceSystem: metadata.service,
        submissionId: metadata.submissionId
      }
    }
  })
}
