import { randomUUID } from 'node:crypto'

import { getSessionByJourneyId } from '../repos/sessions.js'
import { createLogger } from '../logging/logger.js'
import { UUID_V4_PATTERN } from '../constants/correlation.js'

const logger = createLogger()

const isValidJourneyId = (value) => typeof value === 'string' && UUID_V4_PATTERN.test(value)

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

// Resolves and verifies the journeyId supplied on the callback query string against the
// session persisted at initiate time. The callback route has no auth (auth: false), so the
// query parameter is attacker-controllable; a session match on sbi and submissionId guards
// against a caller spoofing another journey's id and polluting its status records.
// Never throws and never rejects the callback — a correlation lookup failure falls back to
// a freshly generated id, which is exactly today's (pre-fix) behaviour.
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
