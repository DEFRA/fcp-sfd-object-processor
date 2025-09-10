import { constants as httpConstants } from 'node:http2'
import { config } from '../../config/index.js'
import db from '../../data/db.js'

export const callbackHandler = async (payload) => {
  const collection = config.get('mongo.collections.uploadMetadata')

  try {
    const result = await db.collection(collection).insertOne({
      uploadStatus: payload.uploadStatus,
      metadata: payload.metadata,
      form: payload.form,
      numberOfRejectedFiles: payload.numberOfRejectedFiles
    })

    if (!result.acknowledged) {
      return {
        body: { message: 'Failed to insert document into database.' },
        status: httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR
      }
    }

    return {
      body: { message: 'Document created successfully' },
      status: httpConstants.HTTP_STATUS_CREATED
    }
  } catch (err) {
    throw new Error('Unable to complete database operation.', { cause: err })
  }
}
