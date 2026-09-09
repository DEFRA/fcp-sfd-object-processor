import { randomUUID } from 'node:crypto'
import Joi from 'joi'

import { getSessionByJourneyId } from '../repos/sessions.js'
import { createLogger } from '../logging/logger.js'

const logger = createLogger()

// Matches how every other uuid is validated in this service (see the schemas under
// src/api/v1). Applied here rather than in the callback payload schema on purpose: a
// schema failure on the callback route diverts to failAction, which persists a
// validation failure status record and answers 201, so a malformed journey id would
// destroy a legitimate upload's metadata. It is validated at this boundary instead,
// where any failure degrades quietly to a generated id.
// required() matters: Joi treats undefined as valid without it, so an absent journey id
// would pass format validation and reach the session lookup as undefined.
const journeyIdSchema = Joi.string().guid({ version: ['uuidv4'] }).required()

const isValidJourneyId = (value) => !journeyIdSchema.validate(value).error

const logUnresolved = (rawJourneyId, reason) => {
  logger.warn({
    event: {
      type: 'callback_journey_id_unresolved',
      action: 'resolve_journey_id',
      outcome: 'failure',
      reason
    }
  }, `Callback journey id could not be resolved; rawJourneyId=${rawJourneyId ?? 'none'}; reason=${reason}`)
}

// Resolves and verifies the journeyId carried in the callback payload metadata against
// the session persisted at initiate time. The callback route has no auth (auth: false),
// so the body is entirely caller-controlled; a session match on sbi and submissionId
// guards against a caller spoofing another journey's id and polluting its status records.
// Never throws and never rejects the callback. A correlation lookup failure falls back to
// a freshly generated id, which is exactly the pre-fix behaviour.
export const resolveJourneyId = async (rawJourneyId, payloadMetadata) => {
  if (!isValidJourneyId(rawJourneyId)) {
    logUnresolved(rawJourneyId, 'missing_or_malformed_journey_id')
    return { journeyId: randomUUID(), source: 'generated' }
  }

  let session
  try {
    session = await getSessionByJourneyId(rawJourneyId)
  } catch (error) {
    logger.warn({
      event: {
        type: 'callback_journey_id_unresolved',
        action: 'resolve_journey_id',
        outcome: 'failure',
        reason: 'session_lookup_failed'
      },
      error: {
        message: error.message
      }
    }, `Session lookup failed while resolving callback journey id; rawJourneyId=${rawJourneyId}`)
    return { journeyId: randomUUID(), source: 'generated' }
  }

  if (!session) {
    logUnresolved(rawJourneyId, 'no_session_found')
    return { journeyId: randomUUID(), source: 'generated' }
  }

  const sbiMatches = session.metadata?.sbi === payloadMetadata?.sbi
  const submissionIdMatches = session.metadata?.submissionId === payloadMetadata?.submissionId

  if (!sbiMatches || !submissionIdMatches) {
    logUnresolved(rawJourneyId, 'session_metadata_mismatch')
    return { journeyId: randomUUID(), source: 'generated' }
  }

  return { journeyId: rawJourneyId, source: 'session' }
}
