export const mockDocumentUploadedEvent = {
  id: '123e4567-e89b-12d3-a456-426655440000',
  source: 'fcp-sfd-object-processor',
  type: 'uk.gov.fcp.sfd.document.uploaded',
  specversion: '1.0',
  datacontenttype: 'application/json',
  time: '2023-10-17T14:48:00Z',
  data: {
    crn: 1234567890,
    crm: {
      caseType: 'CS_Agreement_Evidence',
      title: 'Proof of purchase - Samuel F Armer - 12-12-2025'
    },
    correlationId: '123e4567-e89b-12d3-a456-426655440000',
    file: {
      fileId: '123e4567-e89b-12d3-a456-426655440001',
      fileName: 'receipt.pdf',
      contentType: 'application/pdf'
    },
    sbi: 123456789,
    sourceSystem: 'fcp-sfd-frontend',
    submissionId: '123e4567-e89b-12d3-a456-426655440000'
  }
}
