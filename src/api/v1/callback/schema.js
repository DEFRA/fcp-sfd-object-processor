import Joi from 'joi'

// Pattern for validating MIME types (basic but covers common cases)
const mimeTypePattern = /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_+.-]*$/

// Pattern for base64 strings (SHA-256 checksums are base64 encoded)
const base64Pattern = /^[A-Za-z0-9+/]+=*$/

// Metadata schema - all 11 required fields from CDP Uploader
const metadataSchema = Joi.object({
  sbi: Joi.number()
    .integer()
    .min(100000000)
    .max(999999999)
    .required()
    .description('Single Business Identifier - must be exactly 9 digits')
    .messages({
      'number.base': 'sbi must be a number',
      'number.integer': 'sbi must be an integer',
      'number.min': 'sbi must be exactly 9 digits',
      'number.max': 'sbi must be exactly 9 digits',
      'any.required': 'sbi is required'
    })
    .example(105000000),

  crn: Joi.number()
    .integer()
    .min(1000000000)
    .max(9999999999)
    .required()
    .description('Customer Reference Number - must be exactly 10 digits')
    .messages({
      'number.base': 'crn must be a number',
      'number.integer': 'crn must be an integer',
      'number.min': 'crn must be exactly 10 digits',
      'number.max': 'crn must be exactly 10 digits',
      'any.required': 'crn is required'
    })
    .example(1050000000),

  frn: Joi.number()
    .integer()
    .min(1000000000)
    .max(9999999999)
    .required()
    .description('Firm Reference Number - must be exactly 10 digits')
    .messages({
      'number.base': 'frn must be a number',
      'number.integer': 'frn must be an integer',
      'number.min': 'frn must be exactly 10 digits',
      'number.max': 'frn must be exactly 10 digits',
      'any.required': 'frn is required'
    })
    .example(1102658375),

  submissionId: Joi.string()
    .required()
    .description('Unique identifier for the submission')
    .messages({
      'any.required': 'submissionId is required'
    })
    .example('1733826312'),

  uosr: Joi.string()
    .required()
    .description('Unique Object Storage Reference combining SBI and submission ID')
    .messages({
      'any.required': 'uosr is required'
    })
    .example('105000000_1733826312'),

  submissionDateTime: Joi.string()
    .required()
    .description('Date and time of submission')
    .messages({
      'any.required': 'submissionDateTime is required'
    })
    .example('10/12/2024 10:25:12'),

  files: Joi.array()
    .items(Joi.string())
    .min(1)
    .required()
    .description('Array of file names submitted')
    .messages({
      'array.min': 'files array must contain at least one file',
      'any.required': 'files array is required'
    })
    .example(['document.pdf', 'receipt.jpg']),

  filesInSubmission: Joi.number()
    .integer()
    .min(1)
    .required()
    .description('Total number of files in the submission')
    .messages({
      'number.min': 'filesInSubmission must be at least 1',
      'number.integer': 'filesInSubmission must be an integer',
      'any.required': 'filesInSubmission is required'
    })
    .example(2),

  type: Joi.string()
    .valid('CS_Agreement_Evidence')
    .required()
    .description('Type of submission - determines CRM queue')
    .messages({
      'any.only': 'type must be CS_Agreement_Evidence',
      'any.required': 'type is required'
    })
    .example('CS_Agreement_Evidence'),

  reference: Joi.string()
    .required()
    .description('User-entered reference for the submission')
    .messages({
      'any.required': 'reference is required'
    })
    .example('user entered reference'),

  service: Joi.string()
    .valid('fcp-sfd-frontend', 'rps-portal')
    .required()
    .description('Source system that initiated the upload')
    .messages({
      'any.only': 'service must be either fcp-sfd-frontend or rps-portal',
      'any.required': 'service is required'
    })
    .example('fcp-sfd-frontend')
}).strict()
  .description('Metadata about the upload submission')

// File upload schema for individual file objects in the form
const fileUploadSchema = Joi.object({
  fileId: Joi.string()
    .guid({ version: ['uuidv4'] })
    .required()
    .description('Unique identifier for the uploaded file')
    .messages({
      'string.guid': 'fileId must be a valid UUID v4',
      'any.required': 'fileId is required'
    })
    .example('9fcaabe5-77ec-44db-8356-3a6e8dc51b13'),

  filename: Joi.string()
    .min(1)
    .required()
    .description('Original name of the uploaded file')
    .messages({
      'string.empty': 'filename cannot be empty',
      'any.required': 'filename is required'
    })
    .example('document.pdf'),

  contentType: Joi.string()
    .pattern(mimeTypePattern)
    .required()
    .description('MIME type of the uploaded file')
    .messages({
      'string.pattern.base': 'contentType must be a valid MIME type',
      'any.required': 'contentType is required'
    })
    .example('application/pdf'),

  fileStatus: Joi.string()
    .valid('complete')
    .required()
    .description('Status of the file upload')
    .messages({
      'any.only': 'fileStatus must be complete',
      'any.required': 'fileStatus is required'
    })
    .example('complete'),

  contentLength: Joi.number()
    .integer()
    .min(0)
    .required()
    .description('Size of the file in bytes')
    .messages({
      'number.min': 'contentLength must be a non-negative integer',
      'number.integer': 'contentLength must be an integer',
      'any.required': 'contentLength is required'
    })
    .example(11264),

  checksumSha256: Joi.string()
    .pattern(base64Pattern)
    .required()
    .description('SHA-256 checksum of the file encoded in base64')
    .messages({
      'string.pattern.base': 'checksumSha256 must be a valid base64 string',
      'any.required': 'checksumSha256 is required'
    })
    .example('bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c='),

  detectedContentType: Joi.string()
    .pattern(mimeTypePattern)
    .required()
    .description('MIME type detected by virus scanning')
    .messages({
      'string.pattern.base': 'detectedContentType must be a valid MIME type',
      'any.required': 'detectedContentType is required'
    })
    .example('application/pdf'),

  s3Key: Joi.string()
    .min(1)
    .required()
    .description('S3 object key where the file is stored')
    .messages({
      'string.empty': 's3Key cannot be empty',
      'any.required': 's3Key is required'
    })
    .example('scanned/folder/9fcaabe5-77ec-44db-8356-3a6e8dc51b13'),

  s3Bucket: Joi.string()
    .min(1)
    .required()
    .description('S3 bucket name where the file is stored')
    .messages({
      'string.empty': 's3Bucket cannot be empty',
      'any.required': 's3Bucket is required'
    })
    .example('fcp-sfd-object-processor-bucket')
}).strict()
  .description('File upload metadata from CDP Uploader')

// Form schema - allows string values or file upload objects
// Must contain at least one file upload object
const formSchema = Joi.object()
  .pattern(
    Joi.string(),
    Joi.alternatives().try(
      Joi.string().description('Text form field value'),
      fileUploadSchema
    )
  )
  .custom((value, helpers) => {
    // Check that at least one value is a file upload object (has fileId property)
    const hasFileUpload = Object.values(value).some(
      val => typeof val === 'object' && val !== null && 'fileId' in val
    )
    if (!hasFileUpload) {
      return helpers.error('object.min', { limit: 1 })
    }
    return value
  })
  .min(1)
  .required()
  .description('Form data containing both text fields and file uploads')
  .messages({
    'object.min': '"form" must contain at least one file upload',
    'any.required': '"form" is required'
  })

// Main callback payload schema
export const callbackPayloadSchema = Joi.object({
  uploadStatus: Joi.string()
    .valid('ready', 'initiated', 'pending')
    .required()
    .description('Status of the upload process')
    .messages({
      'any.only': '"uploadStatus" must be one of [ready, initiated, pending]',
      'any.required': '"uploadStatus" is required'
    })
    .example('ready'),

  metadata: metadataSchema.required(),

  form: formSchema.required(),

  numberOfRejectedFiles: Joi.number()
    .integer()
    .min(0)
    .required()
    .description('Number of files rejected during upload')
    .messages({
      'number.min': '"numberOfRejectedFiles" must be a non-negative integer',
      'number.integer': '"numberOfRejectedFiles" must be an integer',
      'any.required': '"numberOfRejectedFiles" is required'
    })
    .example(0)
}).strict()
  .description('Callback payload from CDP Uploader after file upload processing')
