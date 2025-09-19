import Joi from 'joi'

export const callbackPayloadSchema = Joi.object({
  uploadStatus: Joi.string().required(),
  metadata: Joi.object().required(),
  form: Joi.object().required(),
  numberOfRejectedFiles: Joi.number().integer().min(0).required()
})
