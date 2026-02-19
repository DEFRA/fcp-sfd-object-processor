import Joi from 'joi'
import { schemaConsts } from '../../../constants/schemas.js'
import { generateResponseSchemas } from '../schemas/responses.js'

// Pattern for validating MIME types (basic but covers common cases)
const mimeTypePattern = /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_+.-]*$/

// Pattern for base64 strings (SHA-256 checksums are base64 encoded)
const base64Pattern = /^[A-Za-z0-9+/]+=*$/

// Metadata schema - all 11 required fields from CDP Uploader
const metadataSchema = Joi.object({

  sbi: Joi.number()
    .integer()
    .min(schemaConsts.SBI_MIN)
    .max(schemaConsts.SBI_MAX)
    .required()
    .description('Single Business Identifier - must be exactly 9 digits')
    .messages({
      'number.base': 'sbi must be a number',
      'number.integer': 'sbi must be an integer',
      'number.min': 'sbi must be exactly 9 digits',
      'number.max': 'sbi must be exactly 9 digits',
      'any.required': 'sbi is required'
    })
    .example(schemaConsts.SBI_EXAMPLE),
  crn: Joi.number()
    .integer()
    .min(schemaConsts.CRN_MIN)
    .max(schemaConsts.CRN_MAX)
    .required()
    .description('Customer Reference Number - must be exactly 10 digits')
    .messages({
      'number.base': 'crn must be a number',
      'number.integer': 'crn must be an integer',
      'number.min': 'crn must be exactly 10 digits',
      'number.max': 'crn must be exactly 10 digits',
      'any.required': 'crn is required'
    })
    .example(schemaConsts.CRN_EXAMPLE),
  frn: Joi.number()
    .integer()
    .min(schemaConsts.FRN_MIN)
    .max(schemaConsts.FRN_MAX)
    .required()
    .description('Firm Reference Number - must be exactly 10 digits')
    .messages({
      'number.base': 'frn must be a number',
      'number.integer': 'frn must be an integer',
      'number.min': 'frn must be exactly 10 digits',
      'number.max': 'frn must be exactly 10 digits',
      'any.required': 'frn is required'
    })
    .example(schemaConsts.FRN_EXAMPLE),
  submissionId: Joi.string()
    .required()
    .description('Unique identifier for the submission')
    .messages({
      'any.required': 'submissionId is required'
    })
    .example(schemaConsts.SUBMISSION_ID_EXAMPLE),
  uosr: Joi.string()
    .required()
    .description('Unique Object Storage Reference combining SBI and submission ID')
    .messages({
      'any.required': 'uosr is required'
    })
    .example(schemaConsts.UOSR_EXAMPLE),
  submissionDateTime: Joi.string()
    .pattern(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/)
    .required()
    .description('Date and time of submission in DD/MM/YYYY HH:MM:SS format')
    .messages({
      'string.pattern.base': 'submissionDateTime must be in DD/MM/YYYY HH:MM:SS format',
      'any.required': 'submissionDateTime is required'
    })
    .example(schemaConsts.SUBMISSION_DATE_TIME_EXAMPLE),
  files: Joi.array()
    .items(Joi.string())
    .min(1)
    .required()
    .description('Array of file names submitted')
    .messages({
      'array.min': 'files array must contain at least one file',
      'any.required': 'files array is required'
    })
    .example(schemaConsts.FILES_EXAMPLE),
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
    .example(schemaConsts.FILES_IN_SUBMISSION_EXAMPLE),
  type: Joi.string()
    .valid(schemaConsts.TYPE_EXAMPLE)
    .required()
    .description('Type of submission - determines CRM queue')
    .messages({
      'any.only': 'type must be CS_Agreement_Evidence',
      'any.required': 'type is required'
    })
    .example(schemaConsts.TYPE_EXAMPLE),
  reference: Joi.string()
    .required()
    .description('User-entered reference for the submission')
    .messages({
      'any.required': 'reference is required'
    })
    .example(schemaConsts.REFERENCE_EXAMPLE),
  service: Joi.string()
    .valid(...schemaConsts.SERVICE_EXAMPLES)
    .required()
    .description('Source system that initiated the upload')
    .messages({
      'any.only': 'service must be either fcp-sfd-frontend or rps-portal',
      'any.required': 'service is required'
    })
    .example(schemaConsts.SERVICE_EXAMPLE)
}).strict()
  .description('Metadata about the upload submission').label('UploadMetadata')

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
    .example(schemaConsts.FILE_ID_EXAMPLE),
  filename: Joi.string()
    .min(1)
    .required()
    .description('Original name of the uploaded file')
    .messages({
      'string.empty': 'filename cannot be empty',
      'any.required': 'filename is required'
    })
    .example(schemaConsts.FILENAME_EXAMPLE),
  contentType: Joi.string()
    .pattern(mimeTypePattern)
    .required()
    .description('MIME type of the uploaded file')
    .messages({
      'string.pattern.base': 'contentType must be a valid MIME type',
      'any.required': 'contentType is required'
    })
    .example(schemaConsts.CONTENT_TYPE_EXAMPLE),
  fileStatus: Joi.string()
    .valid(schemaConsts.FILE_STATUS_EXAMPLE)
    .required()
    .description('Status of the file upload')
    .messages({
      'any.only': 'fileStatus must be complete',
      'any.required': 'fileStatus is required'
    })
    .example(schemaConsts.FILE_STATUS_EXAMPLE),
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
    .example(schemaConsts.CONTENT_LENGTH_EXAMPLE),
  checksumSha256: Joi.string()
    .pattern(base64Pattern)
    .required()
    .description('SHA-256 checksum of the file encoded in base64')
    .messages({
      'string.pattern.base': 'checksumSha256 must be a valid base64 string',
      'any.required': 'checksumSha256 is required'
    })
    .example(schemaConsts.CHECKSUM_SHA256_EXAMPLE),
  detectedContentType: Joi.string()
    .pattern(mimeTypePattern)
    .required()
    .description('MIME type detected by virus scanning')
    .messages({
      'string.pattern.base': 'detectedContentType must be a valid MIME type',
      'any.required': 'detectedContentType is required'
    })
    .example(schemaConsts.DETECTED_CONTENT_TYPE_EXAMPLE),
  s3Key: Joi.string()
    .min(1)
    .required()
    .description('S3 object key where the file is stored')
    .messages({
      'string.empty': 's3Key cannot be empty',
      'any.required': 's3Key is required'
    })
    .example(schemaConsts.S3_KEY_EXAMPLE),

  s3Bucket: Joi.string()
    .min(1)
    .required()
    .description('S3 bucket name where the file is stored')
    .messages({
      'string.empty': 's3Bucket cannot be empty',
      'any.required': 's3Bucket is required'
    })
    .example(schemaConsts.S3_BUCKET_EXAMPLE)
}).strict()
  .description('File upload metadata from CDP Uploader').label('FileUploadMetadata')

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
  }).label('CallbackForm')

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
    .example(schemaConsts.NUMBER_OF_REJECTED_FILES_EXAMPLE)
}).strict()
  .description('Callback payload from CDP Uploader after file upload processing').label('CallbackPayload')

const callbackSuccessResponseSchema = Joi.object({
  message: Joi.string().example('Metadata created'),
  count: Joi.number().integer().min(0).example(1),
  ids: Joi.array().items(Joi.string()).example(['60b8d295f1d2c916c8a5e9b7'])
}).label('CallbackSuccessResponse')

export const callbackResponseSchema = generateResponseSchemas(callbackSuccessResponseSchema, 201)
