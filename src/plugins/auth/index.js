import { config } from '../../config/index.js'
import { createLogger } from '../../logging/logger.js'
import { constants as httpConstants } from 'node:http2'
import { getEntraAuthOptions } from './entra-options.js'
import { getCognitoAuthOptions } from './cognito-options.js'

const logger = createLogger()

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
        server.auth.strategy('entra', 'jwt', getEntraAuthOptions())
        strategies.push('entra')
      }

      if (cognitoEnabled) {
        server.auth.strategy('cognito', 'jwt', getCognitoAuthOptions())
        strategies.push('cognito')
      }

      // All routes will require authentication unless explicitly set to `auth: false`.
      // When both strategies are enabled, Hapi tries each in order; the first to succeed wins.
      server.auth.default(strategies.length === 1 ? strategies[0] : { strategies })

      // Additional logging for authentication failures for when a request is rejected
      // by Hapi before it reaches our validate function (e.g. missing/invalid token)
      server.ext('onPreResponse', (request, h) => {
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
            tokenGroups: request.auth?.artifacts?.decoded?.payload?.groups // includes groups from token if present, otherwise undefined
          })
        }

        return h.continue
      })
    }
  }
}
