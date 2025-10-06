import Joi from 'joi'
import { constants as httpConstants } from 'node:http2'

// Common http response schemas for 400 404 and 500

const badRequestResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_BAD_REQUEST),
  error: Joi.string().example('Bad Request'),
  message: Joi.string().example('Invalid query parameter'),
  validation:
      Joi.object({
        source: Joi.string(),
        keys: Joi.array().items(Joi.string())
      })
}).label('BadRequest')

const notfoundResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_NOT_FOUND),
  error: Joi.string().example('Not found'),
  message: Joi.string().example('Not found'),
}).label('NotFound')

const serverErrorResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR),
  error: Joi.string().example('Internal Server Error'),
  message: Joi.string().example('Something went wrong'),
}).label('ServerError')

export const generateResponseSchemas = (successSchema) => ({
  200: successSchema,
  400: badRequestResponseSchema,
  404: notfoundResponseSchema,
  500: serverErrorResponseSchema
})
