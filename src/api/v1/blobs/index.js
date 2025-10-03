import Boom from '@hapi/boom'
import { constants as httpConstants } from 'node:http2'

import { getS3ReferenceByFileId } from '../../../repos/metadata.js'
import { generatePresignedUrl } from '../../../repos/s3.js'
import { NotFoundError } from '../../../errors/not-found-error.js'
import { config } from '../../../config/index.js'

const baseUrl = config.get('baseUrl.v1')

export const blobRoute = {
  method: 'GET',
  path: `${baseUrl}/blob/{fileId}`,
  options: {
    tags: ['api', 'blob'],
    // validate: {
    //   params: 'metadataParamSchema',
    //   failAction: (_request, _h, err) => {
    //     throw err
    //   },
    // },
    // response: {
    //   status: responseSchemas
    // }
  },
  handler: async (request, h) => {
    // return a presigned url that allows a user to download the file
    try {
      const { fileId } = request.params

      const { s3: s3Reference } = await getS3ReferenceByFileId(fileId)

      // need some validation around this, what happens if it fails to generate
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
