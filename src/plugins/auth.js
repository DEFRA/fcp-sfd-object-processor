import { config } from '../config/index.js'
import { createLogger } from '../logging/logger.js'
import { constants as httpConstants } from 'node:http2'

const logger = createLogger()
const tenant = config.get('auth.tenant')
const allowedGroupIds = config.get('auth.allowedGroupIds') || []
const authFailedMessage = 'Authentication failed'

export const auth = {
  plugin: {
    name: 'auth',
    register: async (server) => {
      if (config.get('auth.enabled')) {
        server.auth.strategy('entra', 'jwt', getAuthOptions())

        // All routes will require authentication unless explicitly set to `auth: false`
        server.auth.default('entra')

        // Additional logging for authentication failures for when a request is rejected
        // by Hapi before it reaches our validate function (e.g. missing/invalid token)
        server.ext('onPreResponse', (request, h) => {
          const response = request.response

          if (response.isBoom && response.output.statusCode === httpConstants.HTTP_STATUS_UNAUTHORIZED) {
            logger.warn({
              msg: authFailedMessage,
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
}

function getAuthOptions () {
  return {
    keys: {
      uri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`
    },
    verify: {
      aud: false,
      sub: false,
      iss: [`https://sts.windows.net/${tenant}/`, `https://login.microsoftonline.com/${tenant}/v2.0`], // Accept both v1.0 and v2.0 tokens
      nbf: true,
      exp: true
    },
    validate: async (artifacts, request, _h) => {
      const { payload } = artifacts.decoded

      if (payload.typ && payload.typ !== 'JWT' && payload.typ !== 'at+jwt') {
        const errorMessage = 'Provided token is not an access token'
        logger.warn({
          msg: authFailedMessage,
          reason: errorMessage,
          tokenType: payload.typ,
          path: request.path,
          method: request.method,
          sourceIp: request.info.remoteAddress
        })
        return { isValid: false, errorMessage }
      }

      const tokenGroups = Array.isArray(payload.groups) ? payload.groups : []

      // If no allowed groups are configured, reject the token
      if (allowedGroupIds.length === 0) {
        const errorMessage = 'No authorized security groups configured'
        logger.warn({
          msg: authFailedMessage,
          reason: errorMessage,
          path: request.path,
          method: request.method,
          sourceIp: request.info.remoteAddress
        })
        return { isValid: false, errorMessage }
      }

      // Check if token has any matching security groups
      if (!tokenGroups.some(group => allowedGroupIds.includes(group))) {
        const errorMessage = 'Token does not belong to an authorized Security Group'
        logger.warn({
          msg: authFailedMessage,
          reason: errorMessage,
          tokenGroups,
          requiredGroups: allowedGroupIds,
          path: request.path,
          method: request.method,
          sourceIp: request.info.remoteAddress
        })
        return { isValid: false, errorMessage }
      }

      const credentials = {
        token: payload,
        principalId: payload.sub
      }

      return { isValid: true, credentials }
    }
  }
}
