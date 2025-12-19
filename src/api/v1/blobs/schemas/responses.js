import Joi from 'joi'
import { generateResponseSchemas } from '../../schemas/responses.js'

const blobSuccessSchema = Joi.object({
  data: Joi.object({
    url: Joi.string()
      .required()
      .description('Presigned URL that allows time-restricted access to a file in S3.')
      .example('https://my-bucket.s3.amazonaws.com/photos/cat.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20251006%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20251006T121314Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=5a2e4b9c9e4b6d4b8b7a6b6f4f1d5b2c6e7d8a9e6c3f1b2e4d5a6b7c8d9e0f1a')
  })
    .required()
    .description('Data payload containing the presigned URL.')
})
  .required()
  .description('Success response from blob endpoint')

export const blobResponseSchema = generateResponseSchemas(blobSuccessSchema)
