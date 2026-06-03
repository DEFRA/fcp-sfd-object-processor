import { randomUUID } from 'node:crypto'

import { client } from '../data/db.js'
import { persistMetadata, formatInboundMetadata, getMetadataByFileId } from '../repos/metadata.js'
import { createOutboxEntries } from '../repos/outbox.js'
import { insertStatus } from '../repos/status.js'
import { createLogger } from '../logging/logger.js'
import { buildValidatedStatusDocuments, buildValidationFailureStatusDocuments } from '../mappers/status.js'

const logger = createLogger()

const DUPLICATE_KEY_ERROR_CODE = 11000

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
    if (error?.code === DUPLICATE_KEY_ERROR_CODE) {
      const fileIds = Object.values(rawDocuments.form)
        .filter(val => val !== null && typeof val === 'object' && 'fileId' in val)
        .map(val => val.fileId)

      if (fileIds.length === 0) {
        logger.error(error, 'Duplicate key error but no fileIds found in payload')
        throw error
      }

      // All files in a single callback share the same correlationId,
      // so we only need to look up the first to retrieve it.
      const existingDocument = await getMetadataByFileId(fileIds[0])
      const { correlationId } = existingDocument.messaging

      logger.info(
        {
          event: {
            type: 'duplicate_callback',
            outcome: 'success',
            reference: correlationId
          }
        },
        'Duplicate callback received — returning existing correlationId'
      )

      return { duplicate: true, correlationId }
    }

    logger.error(error, 'Failed to persist metadata with outbox')
    throw error
  } finally {
    await session.endSession()
  }
}

const persistValidationFailureStatus = async (payload, validationError) => {
  try {
    const correlationId = randomUUID()
    const statusDocuments = buildValidationFailureStatusDocuments(payload, validationError, correlationId)
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
