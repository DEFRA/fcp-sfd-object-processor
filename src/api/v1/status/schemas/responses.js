import Joi from 'joi'
import { constants as httpConstants } from 'node:http2'
import { generateResponseSchemas } from '../../schemas/responses.js'
import { schemaConsts } from '../../../../constants/schemas.js'

const statusRecordSchema = Joi.object({
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

// The handler returns an empty data array when no records match, so it never
// produces a 404. Only success (200), invalid correlationId (400), auth (401)
// and unexpected errors (500) are reachable.
export const statusResponseSchema = generateResponseSchemas(
  statusSuccessSchema,
  httpConstants.HTTP_STATUS_OK,
  {},
  { omit: [httpConstants.HTTP_STATUS_NOT_FOUND] }
)
