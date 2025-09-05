import Joi from 'joi'

export const initiatePayloadSchema = Joi.object({
  redirect: Joi.string().required(),
  s3Bucket: Joi.string().required(),
  s3Path: Joi.string().optional(),
  callback: Joi.string().uri().optional(),
  metadata: Joi.object().unknown(true).default({}),
  mimeTypes: Joi.array().items(Joi.string()).optional(),
  maxFileSize: Joi.number().integer().positive().optional()
})
