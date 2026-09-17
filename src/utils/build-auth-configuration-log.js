/**
 * Log builders for the two states in which the auth plugin registers no default strategy and
 * every route therefore serves unauthenticated traffic. Both states used to be silent, which meant
 * the only evidence was an unexpected 200 on a route that should have demanded a token.
 *
 * Uses approved ECS `event.*` fields only. The provider flags have no dedicated enforced field, so
 * they are folded into `event.reason` in the same `key=value | key=value` form used by
 * `build-auth-failure-log.js`.
 */

const formatContext = (context) =>
  Object.entries(context)
    .map(([key, value]) => `${key}=${value}`)
    .join(' | ')

/**
 * Builds the log context for authentication being switched off by configuration. This is a
 * legitimate state locally, where both providers default to disabled, so it is a deliberate
 * choice rather than a failure and `event.outcome` is `unknown` rather than `failure`.
 * @param {object} providerFlags
 * @param {boolean} providerFlags.entraEnabled - Value of `auth.entra.enabled`
 * @param {boolean} providerFlags.cognitoEnabled - Value of `auth.cognito.enabled`
 */
export const buildAuthDisabledLog = ({ entraEnabled, cognitoEnabled }) => ({
  msg: 'Authentication is disabled; every route will serve unauthenticated requests',
  event: {
    type: 'auth_disabled',
    outcome: 'unknown',
    reason: formatContext({ entraEnabled, cognitoEnabled })
  }
})

/**
 * Builds the log context for authentication being enabled but impossible to configure, which is
 * always a misconfiguration. The only way to reach it is Entra enabled with an empty tenant list
 * and Cognito disabled; Cognito throws on a missing user pool id rather than failing open.
 * @param {object} providerState
 * @param {boolean} providerState.entraEnabled - Value of `auth.entra.enabled`
 * @param {boolean} providerState.cognitoEnabled - Value of `auth.cognito.enabled`
 * @param {number} providerState.entraTenantCount - Number of configured Entra tenants
 */
export const buildAuthConfigurationFailureLog = ({ entraEnabled, cognitoEnabled, entraTenantCount }) => ({
  msg: 'Authentication is enabled but no provider could be configured; every route will serve unauthenticated requests',
  event: {
    type: 'auth_configuration_failure',
    outcome: 'failure',
    reason: formatContext({ entraEnabled, cognitoEnabled, entraTenantCount })
  }
})
