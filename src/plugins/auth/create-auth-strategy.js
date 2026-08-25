import { createLogger } from '../../logging/logger.js'
import { buildAuthFailureLog } from '../../utils/build-auth-failure-log.js'
import { VALID_TOKEN_TYPES } from '../../constants/auth.js'

const logger = createLogger()

// Both providers verify the same standard claims. Neither checks `aud` or `sub`: Entra access
// tokens are audience-scoped to the resource rather than to us, and Cognito identifies the caller
// with a `client_id` claim instead of `aud`. `iss` is supplied per call as the union of every
// provider's accepted issuers, and is what makes provider dispatch below safe.
const SHARED_VERIFY = {
  aud: false,
  sub: false,
  nbf: true,
  exp: true
}

/**
 * @typedef {object} AuthProvider
 * @property {string}   name                 - Provider name for log context (e.g. 'entra', 'cognito')
 * @property {string[]} jwksUris             - JWKS endpoint URIs supplying this provider's signing keys
 * @property {string[]} issuers              - Every `iss` string this provider may issue tokens under
 * @property {Function} getAllowedList       - `(payload) => string[]`; the allowed values for this token
 * @property {Function} checkAllowed         - `(payload, allowedList) => { allowed, failureContext }`
 * @property {string}   emptyListMessage     - Error message when the allowed list is unconfigured
 * @property {string}   unauthorisedMessage  - Error message when the token is not in the allowed list
 */

/**
 * Builds a single Hapi JWT strategy options object (`{ keys, verify, validate }`) covering every
 * supplied provider.
 *
 * Provider selection is driven by the token's own `iss` claim. This is deliberate. Registering one
 * strategy per provider and relying on hapi's multi-strategy loop only appears to work: that loop
 * advances solely when a strategy reports credentials as *missing*, which happens by accident when
 * the token's `kid` is absent from that provider's JWKS. It depends on the providers' key sets never
 * overlapping, on `@hapi/boom` continuing to treat an empty-string message as "missing", and on
 * `@hapi/jwt` continuing to assign keys before verifying the payload. None of those is a documented
 * contract, and the equivalent assumption already failed between two Entra tenants (FLS1-162).
 * Dispatching on `iss` removes the dependency entirely.
 *
 * @param {AuthProvider[]} providers - One entry per enabled identity provider; must not be empty
 * @returns {{ keys: object[], verify: object, validate: Function }}
 */
export function createAuthStrategy (providers) {
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error('At least one authentication provider is required')
  }

  const issuerToProvider = new Map()

  for (const provider of providers) {
    for (const issuer of provider.issuers) {
      issuerToProvider.set(issuer, provider)
    }
  }

  const jwksUris = [...new Set(providers.flatMap((provider) => provider.jwksUris))]
  const issuers = [...issuerToProvider.keys()]

  return {
    keys: jwksUris.map((uri) => ({ uri })),
    verify: { ...SHARED_VERIFY, iss: issuers },
    validate: async (artifacts, request, _h) => {
      const { payload } = artifacts.decoded
      const provider = issuerToProvider.get(payload.iss)

      if (payload.typ && !VALID_TOKEN_TYPES.includes(payload.typ)) {
        const errorMessage = 'Provided token is not an access token'
        logger.warn(buildAuthFailureLog(errorMessage, request, { tokenType: payload.typ, issuer: payload.iss, strategy: provider?.name }))
        return { isValid: false, errorMessage }
      }

      // `@hapi/jwt` has already rejected any token whose `iss` is not in `verify.iss` above, which is
      // built from these same keys, so this cannot miss in practice. It is defence in depth against a
      // provider being added to `verify.iss` without a matching dispatch entry.
      if (!provider) {
        const errorMessage = 'Token issuer is not recognised'
        logger.warn(buildAuthFailureLog(errorMessage, request, { issuer: payload.iss }))
        return { isValid: false, errorMessage }
      }

      const allowedList = provider.getAllowedList(payload)

      if (allowedList.length === 0) {
        logger.warn(buildAuthFailureLog(provider.emptyListMessage, request, { strategy: provider.name }))
        return { isValid: false, errorMessage: provider.emptyListMessage }
      }

      const { allowed, failureContext } = provider.checkAllowed(payload, allowedList)

      if (!allowed) {
        logger.warn(buildAuthFailureLog(provider.unauthorisedMessage, request, { ...failureContext, strategy: provider.name }))
        return { isValid: false, errorMessage: provider.unauthorisedMessage }
      }

      const credentials = {
        token: payload,
        principalId: payload.sub,
        provider: provider.name
      }

      return { isValid: true, credentials }
    }
  }
}
