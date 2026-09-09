import Joi from 'joi'

// The same rule every other identifier in this service is held to: the schemas under
// src/api/v1, the journey id in src/services/journey-correlation-service.js, and the inbound
// CloudEvent schema in fcp-sfd-crm, which validates data.correlationId as a v4 UUID and
// rejects the message outright when it is not one. One definition of a valid identifier holds
// across the whole chain.
// required() matters: Joi treats undefined as valid without it, so an absent identifier
// would otherwise pass.
// convert: false so that no value is coerced into a string on its way to a document.
const correlationIdSchema = Joi.string().guid({ version: ['uuidv4'] }).required()
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
