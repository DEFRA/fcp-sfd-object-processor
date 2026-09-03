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
    description: 'Retrieve persisted callback validation status by correlationId',
    notes: 'Returns the stored status records (validation outcome and any errors) for a given correlationId.',
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
      const publicStatusRecords = statusRecords.map(({ correlationId: _correlationId, ...record }) => record)

      return h.response({ data: publicStatusRecords }).code(httpConstants.HTTP_STATUS_OK)
    } catch (err) {
      return Boom.internal(err)
    }
  }
}
