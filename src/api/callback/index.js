import { constants as httpConstants } from 'node:http2'
import { createLogger } from '../../logging/logger.js'
import { callbackHandler } from './handler.js'
import { callbackPayloadSchema } from './schema.js'

const logger = createLogger()

export const uploadCallback = {
  method: 'POST',
  path: '/callback',
  options: {
    validate: {
      payload: callbackPayloadSchema,
      options: { abortEarly: false },
      failAction: async (_request, h, err) => {
        return h.response({ err }).code(httpConstants.HTTP_STATUS_BAD_REQUEST).takeover()
      }
    },
    handler: async (request, h) => {
      try {
        const { body, status } = await callbackHandler(request.payload)

        return h.response(body).code(status)
      } catch (err) {
        logger.error(err)

        return h.response({
          error: 'Failed to insert document',
          message: err.message,
          cause: err.cause.message
        }).code(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      }
    }
  }
}
