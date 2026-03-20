import Joi from 'joi'
import { schemaConsts } from '../../../constants/schemas.js'

// Common validation patterns used across schemas
export const patterns = {
  mimeType: /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_+.-]*$/,
  base64: /^[A-Za-z0-9+/]+=*$/,
  dateTime: /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/,
  relativePath: /^\/(?!\/)[^\s]*$/
}

// Shared field schemas for business identifiers
export const businessIdentifierFields = {
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
    .example(schemaConsts.FRN_EXAMPLE)
}

// Shared field schemas for submission metadata
export const submissionFields = {
  submissionId: Joi.string()
    .required()
    .description('Unique identifier for the submission')
    .messages({
      'any.required': 'submissionId is required'
    })
    .example(schemaConsts.SUBMISSION_ID_EXAMPLE),

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
}

// Base metadata schema shared between uploader initiate and callback
export const baseMetadataSchema = Joi.object({
  ...businessIdentifierFields,
  ...submissionFields
}).strict()

// Re-export canonical file upload schema to avoid duplication and drift.
export { fileUploadSchema } from './file-upload-schema.js'
