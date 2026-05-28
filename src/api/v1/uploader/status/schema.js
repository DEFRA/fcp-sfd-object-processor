import Joi from 'joi'
import { constants as httpConstants } from 'node:http2'

import { generateResponseSchemas, badGatewayResponseSchema, gatewayTimeoutResponseSchema } from '../../schemas/responses.js'
import { uploaderResponseFields, mappedResponseFields } from '../../schemas/uploader-common.js'
import { ERROR_MESSAGE_MAX_LENGTH, applyFileStatusConditionals, allowedMimeTypes, base64Pattern } from '../../schemas/file-upload-schema.js'
import { schemaConsts } from '../../../../constants/schemas.js'

export const uploaderStatusParamsSchema = Joi.object({
  uploadId: Joi.string()
    .guid({ version: ['uuidv4'] })
    .required()
    .description('Unique identifier for the upload session')
    .messages({
      'string.guid': 'uploadId must be a valid UUID v4',
      'any.required': 'uploadId is required'
    })
    .example(schemaConsts.UPLOAD_ID_EXAMPLE)
}).label('UploaderStatusParams')

/**
 * File schema specific to the CDP Uploader status response.
 *
 * Unlike the callback (which only fires at ready state with fully-processed files),
 * the status endpoint may return files in various states:
 * - Unprocessed (initiated/early pending): only fileId, filename, contentType
 * - Pending scan: fileStatus: 'pending' added, other fields still absent
 * - Complete: all fields present
 * - Rejected: includes detectedContentType, checksumSha256, hasError, errorMessage
 */
const cdpStatusFileBaseSchema = Joi.object({
  fileId: Joi.string()
    .guid({ version: ['uuidv4'] })
    .required()
    .description('Unique identifier for the uploaded file')
    .label('fileId'),

  filename: Joi.string()
    .min(1)
    .required()
    .description('Original name of the uploaded file')
    .label('filename'),

  contentType: Joi.string()
    .valid(...allowedMimeTypes)
    .required()
    .description('MIME type of the uploaded file')
    .label('contentType'),

  detectedContentType: Joi.string()
    .valid(...allowedMimeTypes)
    .description('MIME type detected by virus scanning')
    .label('detectedContentType'),

  contentLength: Joi.number()
    .integer()
    .min(0)
    .description('Size of the file in bytes')
    .label('contentLength'),

  fileStatus: Joi.string()
    .valid(...schemaConsts.FILE_STATUS_ENUM)
    .description('Status of the file upload')
    .label('fileStatus'),

  hasError: Joi.boolean().label('hasError'),

  errorMessage: Joi.string().min(1).max(ERROR_MESSAGE_MAX_LENGTH).label('errorMessage'),

  checksumSha256: Joi.string()
    .pattern(base64Pattern)
    .description('SHA-256 checksum of the file encoded in base64')
    .label('checksumSha256'),

  s3Key: Joi.string()
    .min(1)
    .description('S3 object key where the file is stored')
    .label('s3Key'),

  s3Bucket: Joi.string()
    .min(1)
    .description('S3 bucket name where the file is stored')
    .label('s3Bucket')
})

const cdpStatusFileSchema = applyFileStatusConditionals(cdpStatusFileBaseSchema)
  .strict()
  .description('File upload metadata from CDP Uploader status response')
  .label('CdpStatusFileMetadata')

// Form values in the CDP Uploader response are either text field strings, file upload objects,
// or arrays of file upload objects (multiple files under one field key).
// We do not require at least one file because early states (initiated) may have an empty form.
const cdpStatusFormSchema = Joi.object()
  .pattern(
    Joi.string(),
    Joi.alternatives().try(
      cdpStatusFileSchema,
      Joi.array().items(cdpStatusFileSchema).description('Array of file upload objects'),
      Joi.string().description('Text form field value')
    )
  )
  .required()
  .description('Form data containing text fields and file upload objects')
  .example({
    'file-upload-1': {
      fileId: schemaConsts.FILE_ID_EXAMPLE,
      filename: schemaConsts.FILENAME_EXAMPLE,
      contentType: schemaConsts.CONTENT_TYPE_EXAMPLE,
      detectedContentType: schemaConsts.DETECTED_CONTENT_TYPE_EXAMPLE,
      fileStatus: schemaConsts.FILE_STATUS_EXAMPLE,
      contentLength: schemaConsts.CONTENT_LENGTH_EXAMPLE,
      checksumSha256: schemaConsts.CHECKSUM_SHA256_EXAMPLE,
      s3Key: schemaConsts.S3_KEY_EXAMPLE,
      s3Bucket: schemaConsts.S3_BUCKET_EXAMPLE
    }
  })
  .label('CdpStatusForm')

export const cdpUploaderStatusResponseSchema = Joi.object({
  uploadStatus: uploaderResponseFields.uploadStatus,

  metadata: Joi.object()
    .required()
    .description('Metadata associated with the upload session')
    .example({
      sbi: schemaConsts.SBI_EXAMPLE,
      crn: schemaConsts.CRN_EXAMPLE,
      frn: schemaConsts.FRN_EXAMPLE,
      submissionId: schemaConsts.SUBMISSION_ID_EXAMPLE,
      uosr: schemaConsts.UOSR_EXAMPLE,
      type: schemaConsts.TYPE_EXAMPLE,
      reference: schemaConsts.REFERENCE_EXAMPLE,
      service: schemaConsts.SERVICE_EXAMPLE
    })
    .label('CdpStatusMetadata'),

  form: cdpStatusFormSchema,

  numberOfRejectedFiles: uploaderResponseFields.numberOfRejectedFiles
}).label('CdpUploaderStatusResponse')

const uploaderStatusSuccessSchema = Joi.object({
  data: Joi.object({
    uploadStatus: mappedResponseFields.uploadStatus,
    metadata: Joi.object()
      .required()
      .description('Metadata associated with the upload session')
      .label('MappedStatusMetadata'),
    form: cdpStatusFormSchema
  }).required().label('MappedUploaderStatusData')
}).label('UploaderStatusSuccessResponse')

const statusNotFoundResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_NOT_FOUND),
  error: Joi.string().example('Not Found'),
  message: Joi.string().example('Upload not found')
}).label('StatusNotFound')

export const uploaderStatusResponseSchema = generateResponseSchemas(
  uploaderStatusSuccessSchema,
  httpConstants.HTTP_STATUS_OK,
  {
    404: statusNotFoundResponseSchema,
    502: badGatewayResponseSchema,
    504: gatewayTimeoutResponseSchema
  }
)
