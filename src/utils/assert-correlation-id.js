import Joi from 'joi'

// The same rule every other identifier in this service is held to. See the schemas under
// src/api/v1, and the inbound CloudEvent schema in fcp-sfd-crm, which validates
// data.correlationId as a v4 UUID and rejects the message outright when it is not one.
//
// An explicit pattern rather than Joi's guid(): guid() also accepts the brace-wrapped
// Microsoft form, {550e8400-e29b-41d4-a716-446655440000}. That form would be written to the
// document and published to CRM in a shape that no longer matches the plain identifier stored
// on the session, so the two could not be joined and the correlation would be silently broken.
// required() matters: Joi treats undefined as valid without it, so an absent identifier
// would otherwise pass.
// convert: false so that no value is coerced into a string on its way to a document.
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const correlationIdSchema = Joi.string().pattern(UUID_V4_PATTERN).required()
const validationOptions = { convert: false }

/**
 * Guards the persistence path against a missing or malformed correlation identifier.
 *
 * This throws where the callback boundary deliberately does not. resolveJourneyId defends a
 * citizen's upload against a caller this service does not control, so it degrades to a
 * generated identifier rather than failing the only delivery of an upload's metadata. By the
 * time control reaches the repository the identifier has either been resolved or been
 * generated, so an absent one is a defect in this service's own code. A document persisted
 * without a usable identifier is worse than no document: it can be reached through no
 * correlation-keyed endpoint, and fcp-sfd-crm rejects the CloudEvent that carries it, so it
 * sits in the collection unreachable and unpublished until someone notices.
 *
 * The received value is not named in the message. Only its type is, so that nothing carried
 * on a caller-controlled payload reaches a log line.
 *
 * @param {string} correlationId - The correlation identifier about to be written to a document
 * @returns {string} The identifier, unchanged, when it is a valid v4 UUID
 * @throws {Error} When the identifier is absent or is not a v4 UUID
 */
export const assertCorrelationId = (correlationId) => {
  const { error } = correlationIdSchema.validate(correlationId, validationOptions)

  if (error) {
    throw new Error(
      `A correlation id is required on the persistence path and must be a v4 UUID; received type ${typeof correlationId}`
    )
  }

  return correlationId
}
