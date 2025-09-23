import Joi from 'joi'

const sbiLength = 9

export const metadataParamSchema = Joi.object({
  sbi: Joi.string()
    .pattern(/^\d+$/) // only digits allowed
    .length(sbiLength)
    .required()
    .messages({ '*': 'Invalid SBI format' })
})
