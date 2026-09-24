import { describe, test, expect } from 'vitest'

import { buildOutboxPollFailureLog } from '../../../src/utils/build-outbox-poll-failure-log.js'

describe('buildOutboxPollFailureLog', () => {
  test('returns the error under err alongside approved ECS event fields', () => {
    const error = new Error('Mongo unavailable')

    expect(buildOutboxPollFailureLog(error)).toEqual({
      err: error,
      event: {
        type: 'outbox_poll_failure',
        action: 'publish_pending',
        outcome: 'failure'
      }
    })
  })

  test('passes the error through by reference so the ECS serialiser can convert it', () => {
    const error = new Error('boom')

    expect(buildOutboxPollFailureLog(error).err).toBe(error)
  })

  test('does not hand-build the error.* fields that ecs-pino-format already derives from err', () => {
    expect(buildOutboxPollFailureLog(new Error('boom'))).not.toHaveProperty('error')
  })
})
