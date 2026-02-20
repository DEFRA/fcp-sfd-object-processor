import Boom from '@hapi/boom'

import { constants as httpConstants } from 'node:http2'
import { createLogger } from '../../../logging/logger.js'
import { callbackPayloadSchema, callbackResponseSchema } from './schema.js'
import { config } from '../../../config/index.js'
import { persistMetadataWithOutbox } from '../../../services/metadata-service.js'
import { metricsCounter } from '../../common/helpers/metrics.js'

const logger = createLogger()
const baseUrl = config.get('baseUrl.v1')

export const uploadCallback = {
  method: 'POST',
  path: `${baseUrl}/callback`,
  options: {
    description: 'Callback used by the CDP Uploader',
    notes: 'This endpoint is only called by the CDP Uploader service after processing an upload request.',
    auth: false, // This endpoint is called by an external service (CDP Uploader) that does not have authentication capabilities, so auth is disabled for this route.
    tags: ['api', 'cdp-uploader'],
    validate: {
      payload: callbackPayloadSchema,
      options: { abortEarly: false },
      failAction: async (request, _h, err) => {
        logger.error({ error: { message: err.message } }, 'Validation failed')
        await metricsCounter('callback_validation_failures')
        throw Boom.boomify(err, { statusCode: httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY })
      }
    },
    response: {
      status: callbackResponseSchema
    },
    handler: async (request, h) => {
      try {
        const result = await persistMetadataWithOutbox(request.payload)

        return h.response({
          message: 'Metadata created',
          count: result.insertedCount,
          ids: Object.values(result.insertedIds).map(id => id.toString())
        }).code(httpConstants.HTTP_STATUS_CREATED)
      } catch (err) {
        logger.error(err)
        return Boom.internal(err)
      }
    }
  }
}
