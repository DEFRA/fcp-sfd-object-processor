import { randomUUID } from 'node:crypto'
import Joi from 'joi'

import { getSessionByJourneyId } from '../repos/sessions.js'
import { metricsCounter } from '../api/common/helpers/metrics.js'
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

// A callback that cannot be correlated is a defect, not a routine outcome: in steady state
// initiate mints the id and the uploader echoes it back verbatim. The counter makes each
// occurrence alarmable rather than leaving it to be found by chance in the logs.
const UNRESOLVED_EVENT = 'callback_journey_id_unresolved'

// The received value is described rather than quoted. The callback route is unauthenticated and
// callbackMetadataSchema types this field as Joi.any(), so whatever a caller sends arrives here
// unchecked: quoting it would let a caller inflate a log line or split one entry into several
// with embedded newlines. This matches the rule assert-correlation-id.js already documents.
//
// The counter is deliberately not awaited. It swallows its own errors, and an unresolved
// callback is common during the transitional window, so making every such callback wait on a
// CloudWatch flush adds latency to the response for no functional gain.
const logUnresolved = (rawJourneyId, reason) => {
  logger.warn({
    event: {
      type: UNRESOLVED_EVENT,
      action: 'resolve_journey_id',
      outcome: 'failure',
      reason
    }
  }, `Callback journey id could not be resolved; reason=${reason}; received type ${typeof rawJourneyId}`)

  metricsCounter(UNRESOLVED_EVENT)
}

// Resolves and verifies the journeyId carried in the callback payload metadata against
// the session persisted at initiate time. The callback route has no auth (auth: false),
// so the body is entirely caller-controlled; a session match on sbi and submissionId
// guards against a caller spoofing another journey's id and polluting its status records.
// Never throws and never rejects the callback: the callback is the only delivery of an
// upload's metadata and CDP Uploader will not present it again, so failing it would discard
// a citizen's documents over an identifier. A lookup failure therefore falls back to a
// freshly generated id, which is the pre-fix behaviour, and is counted so that it can be
// alarmed on. Outside the transitional window it should never happen.
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
        type: UNRESOLVED_EVENT,
        action: 'resolve_journey_id',
        outcome: 'failure',
        reason: 'session_lookup_failed'
      },
      error: {
        message: error.message
      }
    }, 'Session lookup failed while resolving callback journey id')
    metricsCounter(UNRESOLVED_EVENT)
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
