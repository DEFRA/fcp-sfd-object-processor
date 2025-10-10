import Joi from 'joi'

export const blobParamSchema = Joi.object({
  fileId: Joi.string()
    .guid({ version: ['uuidv4'] })
    .required()
    .messages({
      'string.guid': 'The "id" field must be a valid UUID v4.',
      'any.required': 'The "id" field is required.'
    })
})
