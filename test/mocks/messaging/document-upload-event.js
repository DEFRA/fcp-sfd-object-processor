/**
 * SNS Message Mock Data
 *
 * Represents CloudEvents v1.0 formatted messages published to SNS.
 * These are the final OUTPUT messages sent to downstream consumers (CRM).
 *
 * Contract: docs/asyncapi/v1.yaml
 */

// Example CloudEvents message for document.uploaded event
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
      contentType: 'application/pdf',
      url: 'https://fcp-placeholder.cdp-int.defra.cloud/api/v1/blobs/123e4567-e89b-12d3-a456-426655440001'
    },
    sbi: 123456789,
    sourceSystem: 'fcp-sfd-frontend',
    submissionId: '123e4567-e89b-12d3-a456-426655440000'
  }
}
