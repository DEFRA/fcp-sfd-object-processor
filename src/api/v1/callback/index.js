import Boom from '@hapi/boom'

import { constants as httpConstants } from 'node:http2'
import { createLogger } from '../../../logging/logger.js'
import { callbackPayloadSchema } from './schema.js'
import { persistMetadataWithOutbox } from '../../../services/metadata-service.js'
import { config } from '../../../config/index.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')

export const uploadCallback = {
  method: 'POST',
  path: `${baseUrl}/callback`,
  options: {
    description: 'Callback used by the CDP Uploader',
    notes: 'This endpoint is only called by the CDP Uploader service after processing an upload request.',
    tags: ['api', 'cdp-uploader'],
    validate: {
      payload: callbackPayloadSchema,
      options: { abortEarly: false },
      failAction: async (_request, h, err) => {
        return h.response({ err }).code(httpConstants.HTTP_STATUS_BAD_REQUEST).takeover()
      }
    },
    handler: async (request, h) => {
      try {
        await persistMetadataWithOutbox(request.payload)

        return h.response().code(httpConstants.HTTP_STATUS_CREATED)
      } catch (err) {
        logger.error(err)
        return Boom.internal(err)
      }
    }
  }
}
