import { constants as httpConstants } from 'node:http2'
import { config } from '../../config/index.js'
import db from '../../data/db.js'

// {
//   "uploadStatus": "ready",
//   "metadata": {
//     "example-id": "id"
//   },
//   "form": {
//     "a-form-field": "some value",
//     "a-file-upload-field": {
//       "fileId": "9fcaabe5-77ec-44db-8356-3a6e8dc51b13",
//       "filename": "dragon-b.jpeg",
//       "contentType": "image/jpeg",
//       "fileStatus": "complete",
//       "contentLength": 11264,
//       "checksumSha256": "bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=",
//       "detectedContentType": "image/jpeg",
//       "s3Key": "3b0b2a02-a669-44ba-9b78-bd5cb8460253/9fcaabe5-77ec-44db-8356-3a6e8dc51b13",
//       "s3Bucket": "cdp-example-node-frontend"
//     },
//     "another-form-field": "foobazbar"
//   },
//   "numberOfRejectedFiles": 0
// }

export const callbackHandler = async (payload) => {
  const collection = config.get('mongo.collections.uploadMetadata')

  try {
    const result = await db.collection(collection).insertOne({
      ...payload.form,
      ...payload.metadata
    })

    if (!result.acknowledged) {
      return {
        status: httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR,
        message: 'Insert failed'
      }
    }

    return {
      message: 'Metadata stored sucessfully',
      status: httpConstants.HTTP_STATUS_CREATED
    }
  } catch (err) {
    return {
      status: httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR,
      message: 'Database error',
      error: err.message
    }
  }
}
