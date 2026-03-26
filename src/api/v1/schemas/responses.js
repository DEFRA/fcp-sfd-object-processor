import Joi from 'joi'
import { constants as httpConstants } from 'node:http2'

// Common http response schemas for 400 404 and 500

const badRequestResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_BAD_REQUEST),
  error: Joi.string().example('Bad Request'),
  message: Joi.string().example('Invalid query parameter'),
  validation: Joi.object({
    source: Joi.string(),
    keys: Joi.array().items(Joi.string())
  })
}).label('BadRequest')

const notfoundResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_NOT_FOUND),
  error: Joi.string().example('Not found'),
  message: Joi.string().example('Not found')
}).label('NotFound')

const serverErrorResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR),
  error: Joi.string().example('Internal Server Error'),
  message: Joi.string().example('Something went wrong')
}).label('ServerError')

const unauthorizedResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_UNAUTHORIZED),
  error: Joi.string().example('Unauthorized'),
  message: Joi.string().example('Missing authentication'),
  attributes: Joi.object({
    error: Joi.string().example('Bearer token missing').optional(),
    error_description: Joi.string().example('The request requires a valid access token to be provided').optional()
  }).optional().label('UnauthorizedAttributes').description('Additional details about the unauthorized error')
}).label('Unauthorized')

export const badGatewayResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_BAD_GATEWAY),
  error: Joi.string().example('Bad Gateway'),
  message: Joi.string().example('CDP Uploader request failed')
}).label('BadGateway')

export const gatewayTimeoutResponseSchema = Joi.object({
  statusCode: Joi.number().example(httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT),
  error: Joi.string().example('Gateway Timeout'),
  message: Joi.string().example('CDP Uploader request timed out')
}).label('GatewayTimeout')

export const generateResponseSchemas = (successSchema, successCode = 200, customSchemas = {}) => ({
  [successCode]: successSchema,
  400: badRequestResponseSchema,
  401: unauthorizedResponseSchema,
  404: notfoundResponseSchema,
  500: serverErrorResponseSchema,
  ...customSchemas
})
