import { client } from '../data/db.js'
import { persistMetadata, formatInboundMetadata } from '../repos/metadata.js'
import { createOutboxEntries } from '../repos/outbox.js'
import { insertStatus } from '../repos/status.js'
import { createLogger } from '../logging/logger.js'
import { buildValidatedStatusDocuments, buildValidationFailureStatusDocuments } from '../mappers/status.js'

const logger = createLogger()

const persistMetadataWithOutbox = async (rawDocuments) => {
  const session = client.startSession()

  try {
    return await session.withTransaction(async () => {
      const documents = formatInboundMetadata(rawDocuments)
      const statusDocuments = buildValidatedStatusDocuments(documents)

      await insertStatus(statusDocuments, session)

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

const persistValidationFailureStatus = async (payload, validationError) => {
  try {
    const statusDocuments = buildValidationFailureStatusDocuments(payload, validationError)
    return await insertStatus(statusDocuments)
  } catch (error) {
    logger.error(error, 'Failed to persist status records for validation failure')
    throw error
  }
}

export {
  persistMetadataWithOutbox,
  persistValidationFailureStatus
}
