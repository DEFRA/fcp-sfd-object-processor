// Schema-related constants for Joi validation and examples

export const schemaConsts = {
  SBI_MIN: 100000000,
  SBI_MAX: 999999999,
  SBI_EXAMPLE: 105000000,

  CRN_MIN: 1000000000,
  CRN_MAX: 9999999999,
  CRN_EXAMPLE: 1050000000,

  FRN_MIN: 1000000000,
  FRN_MAX: 9999999999,
  FRN_EXAMPLE: 1102658375,

  SUBMISSION_ID_EXAMPLE: '1733826312',
  UOSR_EXAMPLE: '105000000_1733826312',
  SUBMISSION_DATE_TIME_EXAMPLE: '10/12/2024 10:25:12',
  FILES_EXAMPLE: ['document.pdf', 'receipt.jpg'],
  FILES_IN_SUBMISSION_EXAMPLE: 2,
  TYPE_EXAMPLE: 'CS_Agreement_Evidence',
  REFERENCE_EXAMPLE: 'user entered reference',
  SERVICE_EXAMPLES: ['fcp-sfd-frontend', 'rps-portal'],
  SERVICE_EXAMPLE: 'fcp-sfd-frontend',

  FILE_ID_EXAMPLE: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
  FILENAME_EXAMPLE: 'document.pdf',
  CONTENT_TYPE_EXAMPLE: 'application/pdf',
  FILE_STATUS_EXAMPLE: 'complete',
  CONTENT_LENGTH_EXAMPLE: 11264,
  CHECKSUM_SHA256_EXAMPLE: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
  DETECTED_CONTENT_TYPE_EXAMPLE: 'application/pdf',
  S3_KEY_EXAMPLE: 'scanned/folder/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
  S3_BUCKET_EXAMPLE: 'fcp-sfd-object-processor-bucket',
  NUMBER_OF_REJECTED_FILES_EXAMPLE: 0
}
