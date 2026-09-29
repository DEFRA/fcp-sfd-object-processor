/**
 * Builds the structured log context for an outbox run that failed. Uses approved ECS `event.*`
 * fields only.
 *
 * The error is passed through under the `err` key, which `@elastic/ecs-pino-format` converts into
 * `error.type`, `error.message` and `error.stack_trace`, as in build-server-start-failure-log.js.
 * @param {Error} error - The error that ended the outbox run
 */
export const buildOutboxPollFailureLog = (error) => ({
  err: error,
  event: {
    type: 'outbox_poll_failure',
    action: 'publish_pending',
    outcome: 'failure'
  }
})
