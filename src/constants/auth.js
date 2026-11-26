export const VALID_TOKEN_TYPES = ['JWT', 'at+jwt']

// The single Hapi strategy under which every provider is registered. Provider selection happens
// inside `validate()` from the token's own `iss` claim, not by registering a strategy per provider
// and leaning on hapi's multi-strategy loop.
export const AUTH_STRATEGY_NAME = 'bearer'

export const AUTH_ALLOWED_SCOPE = 'sfd-object-processor:access'
export const AUTH_AUDIT_USER_MAX_LENGTH = 50
export const AUTH_FAILURE_AUDIT_PRIORITY = 1
export const INSUFFICIENT_SCOPE_AUDIT_PRIORITY = 5

// Identifies which provider validated (or rejected) a token. Used for log context only.
export const AUTH_PROVIDER_NAMES = {
  ENTRA: 'entra',
  COGNITO: 'cognito'
}
