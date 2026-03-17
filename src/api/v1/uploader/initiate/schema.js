import Joi from 'joi'
import { constants as httpConstants } from 'node:http2'

import { generateResponseSchemas } from '../../schemas/responses.js'
import { baseMetadataSchema, patterns } from '../../schemas/uploader-common.js'

export const initiatePayloadSchema = Joi.object({
  redirect: Joi.string()
    .pattern(patterns.relativePath)
    .required()
    .description('Relative URL to redirect the user to after upload completes')
    .messages({
      'string.pattern.base': 'redirect must be a relative URL starting with /',
      'any.required': 'redirect is required'
    })
    .example('/upload-complete'),

  metadata: baseMetadataSchema
    .required()
    .description('Metadata about the upload submission')
    .label('InitiateMetadata')
}).strict()
  .description('Payload for initiating a browser upload via CDP Uploader')
  .label('InitiatePayload')

const initiateSuccessSchema = Joi.object({
  data: Joi.object({
    uploadId: Joi.string()
      .guid({ version: ['uuidv4'] })
      .required()
      .description('Unique identifier for the upload session')
      .example('9fcaabe5-77ec-44db-8356-3a6e8dc51b13'),
    uploadUrl: Joi.string()
      .required()
      .description('URL to upload files to')
      .example('https://cdp-uploader.{env}.cdp-int.defra.cloud/api/v1/uploader/upload-and-scan/9fcaabe5-77ec-44db-8356-3a6e8dc51b13'),
    statusUrl: Joi.string()
      .required()
      .description('URL to check upload status')
      .example('/api/v1/uploader/status/9fcaabe5-77ec-44db-8356-3a6e8dc51b13')
  }).required().label('InitiateSuccessData')
}).label('InitiateSuccessResponse')

const badGatewayResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_BAD_GATEWAY),
  error: Joi.string().example('Bad Gateway'),
  message: Joi.string().example('CDP Uploader request failed')
}).label('BadGateway')

const gatewayTimeoutResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT),
  error: Joi.string().example('Gateway Timeout'),
  message: Joi.string().example('CDP Uploader request timed out')
}).label('GatewayTimeout')

export const initiateResponseSchema = generateResponseSchemas(
  initiateSuccessSchema,
  httpConstants.HTTP_STATUS_OK,
  {
    502: badGatewayResponseSchema,
    504: gatewayTimeoutResponseSchema
  }
)
