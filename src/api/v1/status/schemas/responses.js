import Joi from 'joi'
import { generateResponseSchemas } from '../../schemas/responses.js'

const statusRecordSchema = Joi.object({
  correlationId: Joi.string()
    .guid({ version: ['uuidv4'] })
    .description('Correlation ID grouping files from the same submission'),
  sbi: Joi.number()
    .integer()
    .min(105000000)
    .max(999999999)
    .allow(null)
    .description('Single Business Identifier'),
  fileId: Joi.string()
    .guid({ version: ['uuidv4'] })
    .description('Unique file identifier'),
  timestamp: Joi.date()
    .iso()
    .description('Timestamp when the status record was created'),
  validated: Joi.boolean()
    .description('Whether the upload payload passed validation'),
  errors: Joi.alternatives()
    .try(
      Joi.array().items(
        Joi.object({
          field: Joi.string(),
          errorType: Joi.string(),
          receivedValue: Joi.string()
        })
      ),
      Joi.valid(null)
    )
    .description('Validation errors, or null if validated successfully')
})
  .label('StatusRecord')
  .description('Status record for a single file upload')

const statusSuccessSchema = Joi.object({
  data: Joi.array()
    .items(statusRecordSchema)
    .description('Array of status records for the given correlationId')
})
  .required()
  .label('StatusResponse')
  .description('Success response from status endpoint')

export const statusResponseSchema = generateResponseSchemas(statusSuccessSchema)
