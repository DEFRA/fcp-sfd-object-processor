import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'

import { getS3ReferenceByFileId } from '../../../repos/metadata.js'
import { blobParamSchema } from './schemas/params.js'
import { generatePresignedUrl } from '../../../repos/s3.js'
import { NotFoundError } from '../../../errors/not-found-error.js'
import { config } from '../../../config/index.js'
import { blobResponseSchema } from './schemas/responses.js'

const baseUrl = config.get('baseUrl.v1')

export const blobRoute = {
  method: 'GET',
  path: `${baseUrl}/blob/{fileId}`,
  options: {
    tags: ['api', 'blob'],
    validate: {
      params: blobParamSchema,
      failAction: (_request, _h, err) => {
        throw err
      },
    },
    response: {
      status: blobResponseSchema
    }
  },
  handler: async (request, h) => {
    try {
      const { fileId } = request.params

      const { s3: s3Reference } = await getS3ReferenceByFileId(fileId)

      const { url } = await generatePresignedUrl(s3Reference)

      return h.response({ data: { url } }).code(httpConstants.HTTP_STATUS_OK)
    } catch (err) {
      if (err instanceof NotFoundError) {
        return Boom.notFound(err)
      }
      return Boom.internal(err)
    }
  }
}
