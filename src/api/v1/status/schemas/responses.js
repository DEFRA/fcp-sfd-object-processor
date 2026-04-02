import Joi from 'joi'
import { generateResponseSchemas } from '../../schemas/responses.js'
import { schemaConsts } from '../../../../constants/schemas.js'

const statusRecordSchema = Joi.object({
  correlationId: Joi.string()
    .guid({ version: ['uuidv4'] }),
  sbi: Joi.number()
    .integer()
    .min(schemaConsts.SBI_MIN)
    .max(schemaConsts.SBI_MAX)
    .allow(null),
  fileId: Joi.string()
    .guid({ version: ['uuidv4'] }),
  timestamp: Joi.date()
    .iso(),
  validated: Joi.boolean(),
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
})

const statusSuccessSchema = Joi.object({
  data: Joi.array()
    .items(statusRecordSchema)
})
  .required()

export const statusResponseSchema = generateResponseSchemas(statusSuccessSchema)
