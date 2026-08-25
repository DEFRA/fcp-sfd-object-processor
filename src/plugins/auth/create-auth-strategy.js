import { createLogger } from '../../logging/logger.js'
import { buildAuthFailureLog } from '../../utils/build-auth-failure-log.js'
import { VALID_TOKEN_TYPES } from '../../constants/auth.js'

const logger = createLogger()

/**
 * Factory that builds a Hapi JWT strategy options object (`{ keys, verify, validate }`)
 * with shared token-type validation, allowed-list enforcement, and credentials building.
 *
 * @param {object} opts
 * @param {string}          opts.strategyName  - Strategy name used in log context (e.g. 'entra', 'cognito')
 * @param {string|string[]} opts.jwksUris      - One or more JWKS endpoint URIs for public key retrieval.
 *                                               A single string is accepted for backward compatibility and is
 *                                               normalised to a one-element array.
 * @param {object}   opts.verify            - Hapi JWT verify config (iss, aud, sub, nbf, exp…)
 * @param {Function} opts.getAllowedList     - `(payload) => string[]`; returns the allowed values array for this
 *                                             token (lazy, called per request). Receives the decoded payload so a
 *                                             multi-tenant strategy can resolve tenant-specific values from claims
 *                                             such as `iss`. Strategies with a single fixed list may ignore the arg.
 * @param {Function} opts.checkAllowed      - `(payload, allowedList) => { allowed: boolean, failureContext: object }`
 * @param {string}   opts.emptyListMessage     - Error message when the allowed list is unconfigured
 * @param {string}   opts.unauthorisedMessage  - Error message when the token is not in the allowed list
 * @returns {{ keys: object, verify: object, validate: Function }}
 */
export function createAuthStrategy ({
  strategyName,
  jwksUris,
  verify,
  getAllowedList,
  checkAllowed,
  emptyListMessage,
  unauthorisedMessage
}) {
  const uris = Array.isArray(jwksUris) ? jwksUris : [jwksUris]

  return {
    keys: uris.map((uri) => ({ uri })),
    verify,
    validate: async (artifacts, request, _h) => {
      const { payload } = artifacts.decoded

      if (payload.typ && !VALID_TOKEN_TYPES.includes(payload.typ)) {
        const errorMessage = 'Provided token is not an access token'
        logger.warn(buildAuthFailureLog(errorMessage, request, { tokenType: payload.typ, issuer: payload.iss, strategy: strategyName }))
        return { isValid: false, errorMessage }
      }

      const allowedList = getAllowedList(payload)

      if (allowedList.length === 0) {
        logger.warn(buildAuthFailureLog(emptyListMessage, request, { strategy: strategyName }))
        return { isValid: false, errorMessage: emptyListMessage }
      }

      const { allowed, failureContext } = checkAllowed(payload, allowedList)

      if (!allowed) {
        logger.warn(buildAuthFailureLog(unauthorisedMessage, request, { ...failureContext, strategy: strategyName }))
        return { isValid: false, errorMessage: unauthorisedMessage }
      }

      const credentials = {
        token: payload,
        principalId: payload.sub
      }

      return { isValid: true, credentials }
    }
  }
}
