import Joi from 'joi'
import { fileUploadSchema, baseMetadataSchema, uploaderResponseFields } from '../schemas/uploader-common.js'
import { generateResponseSchemas } from '../schemas/responses.js'
import { constants as httpConstants } from 'node:http2'

// File upload schema for individual file objects in the form
// Reusing the shared fileUploadSchema from common schemas

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
    'object.min': '"form" must contain at least one file upload'
  }).label('CallbackForm')

// Main callback payload schema
export const callbackPayloadSchema = Joi.object({
  uploadStatus: uploaderResponseFields.uploadStatus,

  metadata: baseMetadataSchema.required(),

  form: formSchema.required(),

  numberOfRejectedFiles: uploaderResponseFields.numberOfRejectedFiles
}).strict()
  .description('Callback payload from CDP Uploader after file upload processing').label('CallbackPayload')

const callbackSuccessResponseSchema = Joi.object({
  message: Joi.string().example('Metadata created'),
  count: Joi.number().integer().min(0).example(1),
  ids: Joi.array().items(Joi.string()).example(['60b8d295f1d2c916c8a5e9b7'])
}).label('CallbackSuccessResponse')

const callbackDuplicateResponseSchema = Joi.object({
  message: Joi.string().example('Duplicate callback ignored'),
  correlationId: Joi.string().uuid().example('550e8400-e29b-41d4-a716-446655440000')
}).label('CallbackDuplicateResponse')

const unprocessableEntityResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY),
  error: Joi.string().example('Unprocessable Entity'),
  message: Joi.string().example('"property0" is not allowed. "property1" is not allowed')
}).label('UnprocessableEntity')

export const callbackResponseSchema = generateResponseSchemas(
  callbackSuccessResponseSchema,
  httpConstants.HTTP_STATUS_CREATED,
  {
    200: callbackDuplicateResponseSchema,
    422: unprocessableEntityResponseSchema
  })
