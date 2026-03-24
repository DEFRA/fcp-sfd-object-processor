import Joi from 'joi'
import { constants as httpConstants } from 'node:http2'

import { generateResponseSchemas } from '../../schemas/responses.js'
import { fileUploadSchema } from '../../schemas/file-upload-schema.js'
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
  uploadStatus: Joi.string()
    .valid('initiated', 'pending', 'ready')
    .required()
    .description('Current status of the upload session')
    .messages({
      'any.only': '"uploadStatus" must be one of [initiated, pending, ready]',
      'any.required': '"uploadStatus" is required'
    })
    .example('ready'),

  metadata: Joi.object()
    .required()
    .description('Metadata associated with the upload session')
    .label('CdpStatusMetadata'),

  form: cdpStatusFormSchema,

  numberOfRejectedFiles: Joi.number()
    .integer()
    .min(0)
    .required()
    .description('Number of files rejected during scanning')
    .messages({
      'number.min': '"numberOfRejectedFiles" must be a non-negative integer',
      'number.integer': '"numberOfRejectedFiles" must be an integer',
      'any.required': '"numberOfRejectedFiles" is required'
    })
    .example(schemaConsts.NUMBER_OF_REJECTED_FILES_EXAMPLE)
}).unknown(true).label('CdpUploaderStatusResponse')

const uploaderStatusSuccessSchema = Joi.object({
  data: cdpUploaderStatusResponseSchema.required()
}).label('UploaderStatusSuccessResponse')

const statusNotFoundResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_NOT_FOUND),
  error: Joi.string().example('Not Found'),
  message: Joi.string().example('Upload not found')
}).label('StatusNotFound')

const badGatewayResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_BAD_GATEWAY),
  error: Joi.string().example('Bad Gateway'),
  message: Joi.string().example('CDP Uploader request failed')
}).label('StatusBadGateway')

const gatewayTimeoutResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT),
  error: Joi.string().example('Gateway Timeout'),
  message: Joi.string().example('CDP Uploader request timed out')
}).label('StatusGatewayTimeout')

export const uploaderStatusResponseSchema = generateResponseSchemas(
  uploaderStatusSuccessSchema,
  httpConstants.HTTP_STATUS_OK,
  {
    404: statusNotFoundResponseSchema,
    502: badGatewayResponseSchema,
    504: gatewayTimeoutResponseSchema
  }
)
