import Joi from 'joi'
import { constants as httpConstants } from 'node:http2'

import { generateResponseSchemas, badGatewayResponseSchema, gatewayTimeoutResponseSchema } from '../../schemas/responses.js'
import { fileUploadSchema, uploaderResponseFields, mappedResponseFields } from '../../schemas/uploader-common.js'
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

// Form values in the CDP Uploader response are either text field strings or file upload objects.
// We do not require at least one file because early states (initiated) may have an empty form.
const cdpStatusFormSchema = Joi.object()
  .pattern(
    Joi.string(),
    Joi.alternatives().try(
      fileUploadSchema,
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
}).unknown(true).label('CdpUploaderStatusResponse')

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
