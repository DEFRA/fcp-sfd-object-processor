import { constants as httpConstants } from 'node:http2'
import { createLogger } from '../../logging/logger.js'
import { metadataHandler } from './handler.js'

const logger = createLogger()

export const metadataRoute = {
  method: 'GET',
  path: '/metadata/{sbi}',
  options: {
    handler: async (request, h) => {
      try {
        const { sbi } = request.params
        const documents = await metadataHandler(sbi)
        return h.response(documents)
      } catch (err) {
        logger.error(err)

        return h.response({
          error: 'Failed to return metadata',
          message: err.message,
          cause: err.cause.message
        }).code(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
      }
    }
  }
}
