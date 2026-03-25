import Joi from 'joi'
import { constants as httpConstants } from 'node:http2'

import { generateResponseSchemas, badGatewayResponseSchema, gatewayTimeoutResponseSchema } from '../../schemas/responses.js'
import { fileUploadSchema, uploaderResponseFields } from '../../schemas/uploader-common.js'
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
    .example(schemaConsts.FILE_ID_EXAMPLE)
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
  .label('CdpStatusForm')

export const cdpUploaderStatusResponseSchema = Joi.object({
  uploadStatus: uploaderResponseFields.uploadStatus,

  metadata: Joi.object()
    .required()
    .description('Metadata associated with the upload session')
    .label('CdpStatusMetadata'),

  form: cdpStatusFormSchema,

  numberOfRejectedFiles: uploaderResponseFields.numberOfRejectedFiles
}).unknown(true).label('CdpUploaderStatusResponse')

const uploaderStatusSuccessSchema = Joi.object({
  data: cdpUploaderStatusResponseSchema.required()
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
