import { describe, test, expect } from 'vitest'
import { constants as httpConstants } from 'node:http2'
import { generateResponseSchemas, badGatewayResponseSchema, gatewayTimeoutResponseSchema } from '../../../../src/api/v1/schemas/responses.js'
import Joi from 'joi'

const schemas = generateResponseSchemas(Joi.object({ id: Joi.string() }))
const unauthorizedSchema = schemas[httpConstants.HTTP_STATUS_UNAUTHORIZED]
const errorMessage = 'Missing authentication'

describe('unauthorizedResponseSchema', () => {
  test('validates a response with only required fields', () => {
    const { error } = unauthorizedSchema.validate({
      statusCode: httpConstants.HTTP_STATUS_UNAUTHORIZED,
      error: 'Unauthorized',
      message: errorMessage
    })
    expect(error).toBeUndefined()
  })

  test('validates a response with attributes.error and attributes.error_description', () => {
    const { error } = unauthorizedSchema.validate({
      statusCode: httpConstants.HTTP_STATUS_UNAUTHORIZED,
      error: 'Unauthorized',
      message: errorMessage,
      attributes: {
        error: 'Bearer token missing',
        error_description: 'The request requires a valid access token to be provided'
      }
    })
    expect(error).toBeUndefined()
  })

  test('validates a response with an empty attributes object', () => {
    const { error } = unauthorizedSchema.validate({
      statusCode: httpConstants.HTTP_STATUS_UNAUTHORIZED,
      error: 'Unauthorized',
      message: errorMessage,
      attributes: {}
    })
    expect(error).toBeUndefined()
  })

  test('validates a response with only attributes.error set', () => {
    const { error } = unauthorizedSchema.validate({
      statusCode: httpConstants.HTTP_STATUS_UNAUTHORIZED,
      error: 'Unauthorized',
      message: errorMessage,
      attributes: { error: 'Bearer token missing' }
    })
    expect(error).toBeUndefined()
  })

  test('validates a response with only attributes.error_description set', () => {
    const { error } = unauthorizedSchema.validate({
      statusCode: httpConstants.HTTP_STATUS_UNAUTHORIZED,
      error: 'Unauthorized',
      message: errorMessage,
      attributes: { error_description: 'Token has expired' }
    })
    expect(error).toBeUndefined()
  })

  test('rejects when attributes.error is not a string', () => {
    const { error } = unauthorizedSchema.validate({
      statusCode: httpConstants.HTTP_STATUS_UNAUTHORIZED,
      error: 'Unauthorized',
      message: errorMessage,
      attributes: { error: 123 }
    })
    expect(error).toBeDefined()
  })

  test('has the correct label', () => {
    expect(unauthorizedSchema.describe().flags.label).toBe('Unauthorized')
  })
})

describe('generateResponseSchemas', () => {
  test('includes 401 schema in generated response schemas', () => {
    expect(schemas[httpConstants.HTTP_STATUS_UNAUTHORIZED]).toBeDefined()
  })

  test('includes 400, 404, and 500 schemas', () => {
    expect(schemas[httpConstants.HTTP_STATUS_BAD_REQUEST]).toBeDefined()
    expect(schemas[httpConstants.HTTP_STATUS_NOT_FOUND]).toBeDefined()
    expect(schemas[httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR]).toBeDefined()
  })
})

describe('badGatewayResponseSchema', () => {
  test('validates a valid 502 response', () => {
    const { error } = badGatewayResponseSchema.validate({
      statusCode: httpConstants.HTTP_STATUS_BAD_GATEWAY,
      error: 'Bad Gateway',
      message: 'CDP Uploader request failed'
    })
    expect(error).toBeUndefined()
  })

  test('has label BadGateway', () => {
    expect(badGatewayResponseSchema.describe().flags.label).toBe('BadGateway')
  })

  test('is a Joi object schema', () => {
    expect(badGatewayResponseSchema.type).toBe('object')
  })
})

describe('gatewayTimeoutResponseSchema', () => {
  test('validates a valid 504 response', () => {
    const { error } = gatewayTimeoutResponseSchema.validate({
      statusCode: httpConstants.HTTP_STATUS_GATEWAY_TIMEOUT,
      error: 'Gateway Timeout',
      message: 'CDP Uploader request timed out'
    })
    expect(error).toBeUndefined()
  })

  test('has label GatewayTimeout', () => {
    expect(gatewayTimeoutResponseSchema.describe().flags.label).toBe('GatewayTimeout')
  })

  test('is a Joi object schema', () => {
    expect(gatewayTimeoutResponseSchema.type).toBe('object')
  })
})
