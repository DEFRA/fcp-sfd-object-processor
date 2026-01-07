import { client } from '../data/db.js'
import { persistMetadata } from '../repos/metadata.js'
import { createOutboxEntries } from '../repos/outbox.js'
import { createLogger } from '../logging/logger.js'

const logger = createLogger()

/**
 * Persists metadata and creates corresponding outbox entries within a transaction
 * @param {Array} documents - Array of metadata documents to persist
 * @returns {Promise<Object>} - Result containing insertedIds from metadata insert
 */
const persistMetadataWithOutbox = async (documents) => {
  const session = client.startSession()

  try {
    return await session.withTransaction(async () => { // why return await here?
      // Insert metadata
      const metadataResult = await persistMetadata(documents, session)

      // Create outbox entries
      await createOutboxEntries(metadataResult.insertedIds, documents, session)

      return metadataResult
    })
  } catch (error) {
    logger.error(error, 'Failed to persist metadata with outbox')
    throw error
  } finally {
    await session.endSession()
  }
}

export { persistMetadataWithOutbox }
