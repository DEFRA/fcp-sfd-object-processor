import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'

import { getMetadataBySbi } from '../../../repos/metadata.js'
import { metadataParamSchema } from './schema.js'
import { NotFoundError } from '../../../errors/not-found-error.js'

export const metadataRoute = {
  method: 'GET',
  path: '/api/v1/metadata/sbi/{sbi}',
  options: {
    tags: ['api', 'metadata'],
    validate: {
      params: metadataParamSchema,
      failAction: (_request, _h, err) => {
        throw err
      },
    },
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
