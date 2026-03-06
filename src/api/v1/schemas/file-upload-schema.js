import Joi from 'joi'
import { schemaConsts } from '../../../constants/schemas.js'

// Basic MIME type pattern
const mimeTypePattern = /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_+.-]*$/
// Base64 pattern (accept standard and URL-safe variants)
const base64Pattern = /^(?:[A-Za-z0-9+/]+=*|[A-Za-z0-9-_]+=*)$/

// Schema validation constants
const ERROR_MESSAGE_MAX_LENGTH = 2000
const EMPTY_FIELD_MESSAGE = '"{#label}" cannot be empty'

/**
 * Canonical CDP Uploader file-upload contract.
 *
 * fileStatus: 'complete' | 'rejected' | 'pending'
 * - complete: must have s3Key, s3Bucket, checksumSha256, contentLength > 0; must NOT have hasError/errorMessage
 * - rejected: must have hasError=true and non-empty errorMessage; must NOT have s3Key/s3Bucket/checksum
 * - pending: minimal constraints (fileId, filename, contentType, detectedContentType allowed)
 *
 * Exported as `fileUploadSchema` for reuse by callback, status, and initiate endpoints.
 */
export const fileUploadSchema = Joi.object({
  fileId: Joi.string()
    .guid({ version: ['uuidv4'] })
    .required()
    .description('Unique identifier for the uploaded file')
    .messages({
      'string.guid': '"{#label}" must be a valid UUID v4'
    })
    .example(schemaConsts.FILE_ID_EXAMPLE).label('fileId'),

  filename: Joi.string()
    .min(1)
    .required()
    .description('Original name of the uploaded file')
    .messages({
      'string.empty': EMPTY_FIELD_MESSAGE
    })
    .example(schemaConsts.FILENAME_EXAMPLE).label('filename'),

  contentType: Joi.string()
    .pattern(mimeTypePattern)
    .required()
    .description('MIME type of the uploaded file')
    .messages({
      'string.pattern.base': '"{#label}" must be a valid MIME type'
    })
    .example(schemaConsts.CONTENT_TYPE_EXAMPLE).label('contentType'),

  detectedContentType: Joi.string()
    .pattern(mimeTypePattern)
    .required()
    .description('MIME type detected by virus scanning')
    .messages({
      'string.pattern.base': '"{#label}" must be a valid MIME type'
    })
    .example(schemaConsts.DETECTED_CONTENT_TYPE_EXAMPLE).label('detectedContentType'),

  contentLength: Joi.number()
    .integer()
    .min(0)
    .description('Size of the file in bytes')
    .messages({
      'number.min': '"{#label}" must be a non-negative integer',
      'number.integer': '"{#label}" must be an integer'
    })
    .example(schemaConsts.CONTENT_LENGTH_EXAMPLE).label('contentLength'),

  fileStatus: Joi.string()
    .valid(...schemaConsts.FILE_STATUS_ENUM)
    .required()
    .description('Status of the file upload')
    .messages({
      'any.only': `"{#label}" must be one of: ${schemaConsts.FILE_STATUS_ENUM.join(', ')}`
    })
    .example(schemaConsts.FILE_STATUS_EXAMPLE).label('fileStatus'),

  hasError: Joi.boolean().example(schemaConsts.HAS_ERROR_EXAMPLE).label('hasError'),

  errorMessage: Joi.string().min(1).max(ERROR_MESSAGE_MAX_LENGTH).example(schemaConsts.ERROR_MESSAGE_EXAMPLE).label('errorMessage'),

  checksumSha256: Joi.string()
    .pattern(base64Pattern)
    .description('SHA-256 checksum of the file encoded in base64')
    .messages({ 'string.pattern.base': '"{#label}" must be a valid base64 string' })
    .example(schemaConsts.CHECKSUM_SHA256_EXAMPLE).label('checksumSha256'),

  s3Key: Joi.string()
    .min(1)
    .description('S3 object key where the file is stored')
    .messages({ 'string.empty': EMPTY_FIELD_MESSAGE })
    .example(schemaConsts.S3_KEY_EXAMPLE).label('s3Key'),

  s3Bucket: Joi.string()
    .min(1)
    .description('S3 bucket name where the file is stored')
    .messages({ 'string.empty': EMPTY_FIELD_MESSAGE })
    .example(schemaConsts.S3_BUCKET_EXAMPLE).label('s3Bucket')
})
  .when(Joi.object({ fileStatus: 'complete' }).unknown(), {
    then: Joi.object({
      s3Key: Joi.required(),
      s3Bucket: Joi.required(),
      checksumSha256: Joi.required(),
      contentLength: Joi.number().integer().min(1).required(),
      hasError: Joi.forbidden(),
      errorMessage: Joi.forbidden()
    })
  })
  .when(Joi.object({ fileStatus: 'rejected' }).unknown(), {
    then: Joi.object({
      hasError: Joi.valid(true).required(),
      errorMessage: Joi.string().min(1).required(),
      s3Key: Joi.forbidden(),
      s3Bucket: Joi.forbidden(),
      checksumSha256: Joi.forbidden()
    })
  })
  .strict()
  .description('File upload metadata from CDP Uploader')
  .label('FileUploadMetadata')
