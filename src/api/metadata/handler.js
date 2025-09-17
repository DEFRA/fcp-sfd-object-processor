import { constants as httpConstants } from 'node:http2'
import { getMetadataBySbi } from '../../repos/metadata.js'

export const metadataHandler = async (sbi) => {
  try {
    const documents = await getMetadataBySbi(sbi)
    // different codes for the scenarios eg not found
    // if (!result.acknowledged) {
    //   return {
    //     body: { message: 'Failed to return documents from database.' },
    //     status: httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR
    //   }
    // }

    return {
      data: documents,
      status: httpConstants.HTTP_STATUS_OK
    }
  } catch (err) {
    throw new Error('Unable to complete database operation.', { cause: err })
  }
}
