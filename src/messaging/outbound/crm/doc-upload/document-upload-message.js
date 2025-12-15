export const buildDocumentUploadMessage = (payload) => ({
  id: crypto.randomUUID(),
  source: 'fcp-sfd-object-processor',
  specversion: '1.0',
  type: 'uk.gov.fcp.sfd.document.upload.case.create', // placeholder until we know the real contract
  datacontenttype: 'application/json',
  time: new Date().toISOString(),
  data: {
    ...payload
    // placeholder until we know the real contract
  }
})
