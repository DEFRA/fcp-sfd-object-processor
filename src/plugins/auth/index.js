import { config } from '../../config/index.js'
import { createLogger } from '../../logging/logger.js'
import { constants as httpConstants } from 'node:http2'
import { getEntraAuthOptions } from './entra-options.js'
import { getCognitoAuthOptions } from './cognito-options.js'
import { AUTH_STRATEGY_NAMES } from '../../constants/auth.js'
import { sendAuditEvent } from '../../messaging/outbound/audit/send-audit-event.js'
import { buildAuthFailureResponseLog } from '../../utils/build-auth-failure-response-log.js'

const logger = createLogger()
const tracingHeader = config.get('tracing.header')

export const auth = {
  plugin: {
    name: 'auth',
    register: async (server) => {
      const entraEnabled = config.get('auth.entra.enabled')
      const cognitoEnabled = config.get('auth.cognito.enabled')

      if (!entraEnabled && !cognitoEnabled) {
        return
      }

      const strategies = []

      if (entraEnabled) {
        const tenants = config.get('auth.entra.tenants')
        // A single strategy is registered covering every configured tenant, rather than one
        // strategy per tenant. Registering per-tenant strategies would appear to give hapi a
        // fallback across tenants via its multi-strategy loop, but that loop only advances past
        // a strategy that rejects with a *missing*-credentials error; a substantive failure such
        // as an issuer mismatch throws immediately and no later strategy is ever tried. Because
        // Entra serves identical signing keys across tenants, a token for tenant B is not turned
        // away as "missing" by tenant A's strategy — it is rejected outright with a misleading
        // "iss value not allowed" error, and the strategy that would have accepted it is never
        // reached. See .github/debugging/fcp-sfd-object-processor-entra-401-iss-mismatch.md.
        // Only register the strategy when at least one tenant is configured: an empty
        // `verify.iss` is rejected by @hapi/jwt's own schema and would fail server startup.
        if (tenants.length > 0) {
          server.auth.strategy(AUTH_STRATEGY_NAMES.ENTRA, 'jwt', getEntraAuthOptions(tenants))
          strategies.push(AUTH_STRATEGY_NAMES.ENTRA)
        }
      }

      if (cognitoEnabled) {
        server.auth.strategy(AUTH_STRATEGY_NAMES.COGNITO, 'jwt', getCognitoAuthOptions())
        strategies.push(AUTH_STRATEGY_NAMES.COGNITO)
      }

      // All routes will require authentication unless explicitly set to `auth: false`.
      // Entra and Cognito use disjoint JWKS key sets (different `kid`s), so hapi's
      // isMissing-based fallback between the two strategies works correctly: a token
      // presented to the wrong strategy finds no matching signing key and is treated as
      // "missing" rather than substantively rejected, letting hapi try the other strategy.
      // This is not true *within* Entra when multiple tenants share signing keys, which is
      // why Entra tenants are combined into a single strategy above rather than one each.
      if (strategies.length === 0) {
        return
      }
      server.auth.default(strategies.length === 1 ? strategies[0] : { strategies })

      // Additional logging for authentication failures for when a request is rejected
      // by Hapi before it reaches our validate function (e.g. missing/invalid token)
      server.ext('onPreResponse', (request, h) => {
        const response = request.response

        if (response.isBoom && response.output.statusCode === httpConstants.HTTP_STATUS_UNAUTHORIZED) {
          const sanitisedMessage = response.output.payload.message || 'authentication_failed'

          logger.warn(buildAuthFailureResponseLog(request, sanitisedMessage))
          sendAuditEvent({
            correlationid: request.headers[tracingHeader],
            security: {
              pmccode: 'AUTH',
              priority: 1, // 1 marks this as a high-priority security event,
              details: {
                message: sanitisedMessage
              }
            },
            audit: {
              entities: [{ entity: 'document', action: 'failed' }],
              status: 'failure',
              details: { path: request.path, method: request.method }
            }
          }, request).catch((err) => {
            logger.warn({ msg: 'Failed to send auth failure audit event', err })
          })
        }

        return h.continue
      })
    }
  }
}
