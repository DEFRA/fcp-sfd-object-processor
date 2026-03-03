import Joi from 'joi'

export const statusParamSchema = Joi.object({
  correlationId: Joi.string()
    .guid({ version: ['uuidv4'] })
    .required()
    .messages({
      'string.guid': 'The correlationId must be a valid UUID v4.',
      'any.required': 'The correlationId is required.'
    })
})
