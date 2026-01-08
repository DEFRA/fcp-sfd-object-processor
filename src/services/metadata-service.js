import { client } from '../data/db.js'
import { persistMetadata, formatInboundMetadata } from '../repos/metadata.js'
import { createOutboxEntries } from '../repos/outbox.js'
import { createLogger } from '../logging/logger.js'

const logger = createLogger()

const persistMetadataWithOutbox = async (rawDocuments) => {
  const session = client.startSession()

  try {
    return await session.withTransaction(async () => {
      const documents = formatInboundMetadata(rawDocuments)

      const metadataResult = await persistMetadata(documents, session)

      await createOutboxEntries(metadataResult.insertedIds, documents, session)

      return metadataResult
      // returning the inserted ids and number of inserted documents
      // this can be used in the response to the caller
    })
  } catch (error) {
    logger.error(error, 'Failed to persist metadata with outbox')
    throw error
  } finally {
    await session.endSession()
  }
}

export { persistMetadataWithOutbox }
