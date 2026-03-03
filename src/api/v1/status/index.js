import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'

import { getStatusByCorrelationId } from '../../../repos/status.js'
import { config } from '../../../config/index.js'
import { statusParamSchema } from './schemas/params.js'
import { statusResponseSchema } from './schemas/responses.js'

const baseUrl = config.get('baseUrl.v1')

export const statusRoute = {
  method: 'GET',
  path: `${baseUrl}/status/{correlationId}`,
  options: {
    tags: ['api', 'status'],
    validate: {
      params: statusParamSchema,
      failAction: (_request, _h, err) => {
        throw err
      }
    },
    response: {
      status: statusResponseSchema
    }
  },
  handler: async (request, h) => {
    try {
      const { correlationId } = request.params

      const statusRecords = await getStatusByCorrelationId(correlationId)

      return h.response({ data: statusRecords }).code(httpConstants.HTTP_STATUS_OK)
    } catch (err) {
      return Boom.internal(err)
    }
  }
}
