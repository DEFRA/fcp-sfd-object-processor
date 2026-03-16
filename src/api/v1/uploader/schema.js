import Joi from 'joi'
import { constants as httpConstants } from 'node:http2'

import { schemaConsts } from '../../../constants/schemas.js'
import { generateResponseSchemas } from '../schemas/responses.js'

export const initiatePayloadSchema = Joi.object({
  redirect: Joi.string()
    .pattern(/^\//)
    .required()
    .description('Relative URL to redirect the user to after upload completes')
    .messages({
      'string.pattern.base': 'redirect must be a relative URL starting with /',
      'any.required': 'redirect is required'
    })
    .example('/upload-complete'),

  metadata: Joi.object({
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
    // TODO: Make this an enumerable type in the future when we have a better understanding of the possible values
    type: Joi.string()
      .required()
      .description('Type of submission - determines CRM queue')
      .messages({
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
      .example(schemaConsts.SERVICE_EXAMPLE),
    uosr: Joi.string()
      .required()
      .description('Unique Object Storage Reference combining SBI and submission ID')
      .messages({
        'any.required': 'uosr is required'
      })
      .example(schemaConsts.UOSR_EXAMPLE)
  }).strict()
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
      .example('/api/v1/uploader/upload-and-scan/9fcaabe5-77ec-44db-8356-3a6e8dc51b13'),
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
