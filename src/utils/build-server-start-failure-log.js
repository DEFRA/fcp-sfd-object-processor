/**
 * Builds the structured log context for a server that failed to start. Uses approved ECS `event.*`
 * fields only.
 *
 * The error is passed through under the `err` key rather than as hand-built `error.*` fields.
 * `@elastic/ecs-pino-format` is configured in src/logging/logger-options.js with `convertErr`
 * left at its default of true, so it converts `err` into `error.type`, `error.message` and
 * `error.stack_trace` for us. Building those three fields here would duplicate the serialiser and
 * risk drifting from it.
 * @param {Error} error - The error that prevented the server from starting
 */
export const buildServerStartFailureLog = (error) => ({
  err: error,
  event: {
    type: 'server_start',
    action: 'start',
    outcome: 'failure'
  }
})
