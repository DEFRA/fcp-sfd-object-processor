import Joi from 'joi'
import { randomUUID } from 'node:crypto'
import { config } from '../../config/index.js'
import { createLogger } from '../../logging/logger.js'
import { constants as httpConstants } from 'node:http2'
import { getEntraAuthProvider } from './entra-options.js'
import { getCognitoAuthProvider } from './cognito-options.js'
import { createAuthStrategy } from './create-auth-strategy.js'
import { AUTH_ALLOWED_SCOPE, AUTH_STRATEGY_NAME } from '../../constants/auth.js'
import { blobRoutePath } from '../../api/v1/blobs/route-path.js'
import { sendAuditEvent } from '../../messaging/outbound/audit/send-audit-event.js'
import { buildAuthFailureResponseLog } from '../../utils/build-auth-failure-response-log.js'
import { buildAuthDisabledLog, buildAuthConfigurationFailureLog } from '../../utils/build-auth-configuration-log.js'
import PMCCODE from '../../constants/pmccodes.js'

const logger = createLogger()
const tracingHeader = config.get('tracing.header')
const fileIdSchema = Joi.string().guid({ version: ['uuidv4'] })
const MAX_AUDIT_USER_LENGTH = 50
const AUTH_FAILURE_AUDIT_PRIORITY = 1
const INSUFFICIENT_SCOPE_AUDIT_PRIORITY = 5

// Auth rejections happen before a document is identified for most routes, so the audit event
// names the request itself (entity: 'request', entityid: the correlation id) following fcp-audit's
// own api-audit convention of entityid-as-trace-id. On /v1/blob/{fileId} the file UUID is already
// in the path, so a document entity is used instead. Agreed with the audit service owners as an
// entity-naming convention rather than a schema requirement.
// Auth runs before route param validation, so `request.params.fileId` is untrusted here: an
// oversized value would fail the audit publisher's schema and discard the security event entirely.
const buildAuthFailureEntity = (request, correlationId) => {
  const fileId = request.route?.path === blobRoutePath ? request.params?.fileId : undefined

  if (fileId && !fileIdSchema.validate(fileId).error) {
    return { entity: 'document', action: 'failed', entityid: fileId }
  }

  return { entity: 'request', action: 'failed', entityid: correlationId }
}

const getAuthProviders = (entraEnabled, cognitoEnabled) => {
  const providers = []
  let entraTenantCount = 0

  if (entraEnabled) {
    const tenants = config.get('auth.entra.tenants')
    entraTenantCount = tenants.length
    // An empty issuer list is rejected by @hapi/jwt's schema and would fail server startup.
    if (tenants.length > 0) {
      providers.push(getEntraAuthProvider(tenants))
    }
  }

  if (cognitoEnabled) {
    providers.push(getCognitoAuthProvider())
  }

  return { providers, entraTenantCount }
}

const sendAuthFailureAuditEvent = (request, message, priority, principalId) => {
  const correlationId = request.headers[tracingHeader] ?? randomUUID()

  sendAuditEvent({
    correlationid: correlationId,
    ...(typeof principalId === 'string' ? { user: principalId.slice(0, MAX_AUDIT_USER_LENGTH) } : {}),
    security: {
      pmccode: PMCCODE.AUTH,
      priority,
      details: { message }
    },
    audit: {
      entities: [buildAuthFailureEntity(request, correlationId)],
      status: 'failure',
      details: { path: request.path, method: request.method }
    }
  }, request).catch((err) => {
    logger.warn({ msg: 'Failed to send auth failure audit event', err })
  })
}

const registerAuthFailureResponseHandler = (server) => {
  server.ext('onPreResponse', (request, h) => {
    const response = request.response

    if (response.isBoom && response.output.statusCode === httpConstants.HTTP_STATUS_UNAUTHORIZED) {
      const sanitisedMessage = response.output.payload.message || 'authentication_failed'
      logger.warn(buildAuthFailureResponseLog(request, sanitisedMessage))
      // Interim pending SOC agreement; the specification defines priority as rarity.
      sendAuthFailureAuditEvent(request, sanitisedMessage, AUTH_FAILURE_AUDIT_PRIORITY)
    }

    if (
      response.isBoom &&
      response.output.statusCode === httpConstants.HTTP_STATUS_FORBIDDEN &&
      response.output.payload?.message === 'Insufficient scope'
    ) {
      // Both values are interim pending SOC agreement.
      sendAuthFailureAuditEvent(
        request,
        response.output.payload.message,
        INSUFFICIENT_SCOPE_AUDIT_PRIORITY,
        request.auth?.credentials?.principalId
      )
    }

    return h.continue
  })
}

export const auth = {
  plugin: {
    name: 'auth',
    register: async (server) => {
      const entraEnabled = config.get('auth.entra.enabled')
      const cognitoEnabled = config.get('auth.cognito.enabled')

      if (!entraEnabled && !cognitoEnabled) {
        logger.warn(buildAuthDisabledLog({ entraEnabled, cognitoEnabled }))
        return
      }

      // Every enabled provider is folded into one strategy that dispatches on the token's own
      // `iss` claim. hapi's multi-strategy fallback is deliberately not used: it only advances
      // past a strategy that reports credentials as *missing*, never past a substantive rejection
      // such as an issuer mismatch. Between two Entra tenants that assumption already failed,
      // because Entra serves identical signing keys across tenants (FLS1-162). Between Entra and
      // Cognito it happened to hold, but only because their key sets do not overlap, which is not
      // a contract either provider offers. Dispatching on `iss` makes the choice deterministic.
      // See .github/debugging/fcp-sfd-object-processor-entra-401-iss-mismatch.md.
      const { providers, entraTenantCount } = getAuthProviders(entraEnabled, cognitoEnabled)

      // Reaching here means authentication was asked for but could not be set up, so no default
      // strategy is registered and every route serves unauthenticated traffic. That is a
      // misconfiguration rather than a choice, so it is logged at `error` to be alertable rather
      // than inferred from an unexpected 200.
      if (providers.length === 0) {
        logger.error(buildAuthConfigurationFailureLog({ entraEnabled, cognitoEnabled, entraTenantCount }))
        return
      }

      // All routes will require authentication unless explicitly set to `auth: false`.
      server.auth.strategy(AUTH_STRATEGY_NAME, 'jwt', createAuthStrategy(providers))
      server.auth.default({
        strategy: AUTH_STRATEGY_NAME,
        access: [{ scope: [AUTH_ALLOWED_SCOPE] }]
      })

      // Additional logging for authentication failures for when a request is rejected
      // by Hapi before it reaches our validate function (e.g. missing/invalid token)
      registerAuthFailureResponseHandler(server)
    }
  }
}
