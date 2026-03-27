import { createLogger } from '../../logging/logger.js'
import { buildAuthFailureLog } from '../../utils/build-auth-failure-log.js'
import { VALID_TOKEN_TYPES } from '../../constants/auth.js'

const logger = createLogger()

/**
 * Factory that builds a Hapi JWT strategy options object (`{ keys, verify, validate }`)
 * with shared token-type validation, allowed-list enforcement, and credentials building.
 *
 * @param {object} opts
 * @param {string}   opts.strategyName      - Strategy name used in log context (e.g. 'entra', 'cognito')
 * @param {string}   opts.jwksUri           - JWKS endpoint URI for public key retrieval
 * @param {object}   opts.verify            - Hapi JWT verify config (iss, aud, sub, nbf, exp…)
 * @param {Function} opts.getAllowedList     - Zero-arg function; returns the allowed values array (lazy, called per request)
 * @param {Function} opts.checkAllowed      - `(payload, allowedList) => { allowed: boolean, failureContext: object }`
 * @param {string}   opts.emptyListMessage     - Error message when the allowed list is unconfigured
 * @param {string}   opts.unauthorisedMessage  - Error message when the token is not in the allowed list
 * @returns {{ keys: object, verify: object, validate: Function }}
 */
export function createAuthStrategy ({
  strategyName,
  jwksUri,
  verify,
  getAllowedList,
  checkAllowed,
  emptyListMessage,
  unauthorisedMessage
}) {
  return {
    strategyName,
    keys: {
      uri: jwksUri
    },
    verify,
    validate: async (artifacts, request, _h) => {
      const { payload } = artifacts.decoded

      if (payload.typ && !VALID_TOKEN_TYPES.includes(payload.typ)) {
        const errorMessage = 'Provided token is not an access token'
        logger.warn(buildAuthFailureLog(errorMessage, request, { tokenType: payload.typ, issuer: payload.iss, strategy: strategyName }))
        return { isValid: false, errorMessage }
      }

      const allowedList = getAllowedList()

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
