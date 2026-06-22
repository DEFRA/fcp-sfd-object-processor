import { config } from '../../config/index.js'
import { createLogger } from '../../logging/logger.js'
import { constants as httpConstants } from 'node:http2'
import { getEntraAuthOptions } from './entra-options.js'
import { getCognitoAuthOptions } from './cognito-options.js'
import { AUTH_STRATEGY_NAMES } from '../../constants/auth.js'
import { publishAuditEvent } from '../../messaging/outbound/audit/publish-audit-event.js'

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
        // Register one strategy per tenant; use the same strategyName used in
        // the auth options (which includes the tenant id) so logs and Hapi
        // strategy names align for easier debugging.
        tenants.forEach((tenantConfig, idx) => {
          const options = getEntraAuthOptions(tenantConfig)
          const strategyName = options.strategyName || `entra-${idx}`
          server.auth.strategy(strategyName, 'jwt', options)
          strategies.push(strategyName)
        })
      }

      if (cognitoEnabled) {
        server.auth.strategy(AUTH_STRATEGY_NAMES.COGNITO, 'jwt', getCognitoAuthOptions())
        strategies.push(AUTH_STRATEGY_NAMES.COGNITO)
      }

      // All routes will require authentication unless explicitly set to `auth: false`.
      // When both strategies are enabled, Hapi tries each in order; the first to succeed wins.
      server.auth.default(strategies.length === 1 ? strategies[0] : { strategies })

      // Additional logging for authentication failures for when a request is rejected
      // by Hapi before it reaches our validate function (e.g. missing/invalid token)
      server.ext('onPreResponse', async (request, h) => {
        const response = request.response

        if (response.isBoom && response.output.statusCode === httpConstants.HTTP_STATUS_UNAUTHORIZED) {
          logger.warn({
            msg: 'Authentication failed',
            reason: response.message || response.output.payload.message,
            path: request.path,
            method: request.method,
            sourceIp: request.info.remoteAddress,
            userAgent: request.headers['user-agent'],
            // Only include if token was present and decoded
            tokenGroups: request.auth?.artifacts?.decoded?.payload?.groups, // includes groups from token if present, otherwise undefined
            tokenClientId: request.auth?.artifacts?.decoded?.payload?.client_id // includes client_id from Cognito token if present, otherwise undefined
          })
          try {
            await publishAuditEvent({
              correlationid: request.headers[tracingHeader],
              security: {
                pmccode: 'AUTH',
                priority: 1,
                details: {
                  message: response.message || response.output.payload.message || 'authentication_failed'
                }
              },
              audit: {
                entities: [{ entity: 'document', action: 'failed' }],
                status: 'failure',
                details: { path: request.path, method: request.method }
              }
            })
          } catch (_) {}
        }

        return h.continue
      })
    }
  }
}
