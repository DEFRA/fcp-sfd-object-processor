import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'

import { getMetadataBySbi } from '../../../repos/metadata.js'
import { metadataParamSchema, metadataResponseSchema } from './schemas/index.js'
import { NotFoundError } from '../../../errors/not-found-error.js'
import { config } from '../../../config/index.js'

const baseUrl = config.get('baseUrl.v1')

export const metadataRoute = {
  method: 'GET',
  path: `${baseUrl}/metadata/sbi/{sbi}`,
  options: {
    tags: ['api', 'metadata'],
    validate: {
      params: metadataParamSchema,
      failAction: (_request, _h, err) => {
        throw err
      },
    },
    response: {
      status: metadataResponseSchema
    }
  },
  handler: async (request, h) => {
    try {
      const { sbi } = request.params
      const documents = await getMetadataBySbi(sbi)

      return h.response({ data: documents }).code(httpConstants.HTTP_STATUS_OK)
    } catch (err) {
      if (err instanceof NotFoundError) {
        return Boom.notFound(err)
      }
      return Boom.internal(err)
    }
  }
}
