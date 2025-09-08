import { constants as httpConstants } from 'node:http2'
import { createLogger } from '../../logging/logger.js'
import { initiatePayloadSchema } from './schema.js'
import { initiateHandler } from './handler.js'

const logger = createLogger()

export const initiateUpload = {
  method: 'POST',
  path: '/initiate',
  options: {
    validate: {
      payload: initiatePayloadSchema,
      options: { abortEarly: false },
      failAction: async (_request, h, err) => {
        return h.response({ err }).code(httpConstants.HTTP_STATUS_BAD_REQUEST).takeover()
      }
    },
    handler: async (request, h) => {
      try {
        const { body, status } = await initiateHandler(request.payload)

        return h.response(body).code(status)
      } catch (err) {
        logger.error(err)

        return h.response({
          error: 'Upstream upload service unavailable',
          message: err.message
        }).code(httpConstants.INTERNAL_SERVER_ERROR)
      }
    }
  }
}
