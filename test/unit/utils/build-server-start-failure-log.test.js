import { describe, test, expect } from 'vitest'

import { buildServerStartFailureLog } from '../../../src/utils/build-server-start-failure-log.js'

describe('buildServerStartFailureLog', () => {
  test('returns the error under err alongside approved ECS event fields', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:27017')

    expect(buildServerStartFailureLog(error)).toEqual({
      err: error,
      event: {
        type: 'server_start',
        action: 'start',
        outcome: 'failure'
      }
    })
  })

  test('passes the error through by reference so the ECS serialiser can convert it', () => {
    const error = new Error('boom')

    const log = buildServerStartFailureLog(error)

    expect(log.err).toBe(error)
    expect(log.err.stack).toEqual(expect.any(String))
  })

  test('does not hand-build the error.* fields that ecs-pino-format already derives from err', () => {
    const log = buildServerStartFailureLog(new Error('boom'))

    expect(log).not.toHaveProperty('error')
  })
})
