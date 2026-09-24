import { config } from '../../config/index.js'
import { createLogger } from '../../logging/logger.js'
import { buildOutboxPollFailureLog } from '../../utils/build-outbox-poll-failure-log.js'

import { publishPendingMessages } from './crm/doc-upload/publish-pending-messages.js'

const logger = createLogger()

let outboxTimer
let currentRun
let isStopping = false

const scheduleNextRun = () => {
  if (isStopping) {
    return
  }

  outboxTimer = setTimeout(startOutbox, config.get('messaging.outboxIntervalMs'))
}

// This is the only place a failed run is logged. The run never rejects, so a
// failure at boot does not stop the process and a failure from the timer does
// not reach the unhandledRejection handler. The next run is always scheduled.
const runOutbox = async () => {
  try {
    await publishPendingMessages()
  } catch (error) {
    logger.error(buildOutboxPollFailureLog(error), 'Outbox processing failed')
  } finally {
    scheduleNextRun()
  }
}

// Refuses to start once shutdown has begun. Without this, a first run started
// by src/index.js after a SIGTERM during boot would be neither prevented nor
// awaited by stopOutbox, and could reach MongoDB after closeDb.
const startOutbox = () => {
  if (isStopping) {
    return Promise.resolve()
  }

  currentRun = runOutbox()
  return currentRun
}

// Registered as hapi-pulse's preServerStop, which hapi-pulse awaits before
// postServerStop closes the MongoDB client. Cancels the pending poll, stops an
// in-flight run from rescheduling itself, and waits for that run to finish so
// it can finalise its claimed entries before the connection closes.
//
// The wait is capped because hapi-pulse applies its shutdown timeout only to
// server.stop(), and neither the MongoDB nor the SNS client sets a request
// timeout, so a stalled run would otherwise block shutdown until the process
// is killed. Abandoning a run is safe: its claimed entries are picked up again
// once claimedUntil expires.
const stopOutbox = async () => {
  isStopping = true
  clearTimeout(outboxTimer)
  outboxTimer = undefined

  if (!currentRun) {
    return
  }

  let drainTimer

  const drained = await Promise.race([
    currentRun.then(() => true),
    new Promise((resolve) => {
      drainTimer = setTimeout(() => resolve(false), config.get('messaging.outboxDrainTimeoutMs'))
    })
  ])

  clearTimeout(drainTimer)

  if (!drained) {
    logger.warn(
      { event: { type: 'outbox_drain_timeout', action: 'stop', outcome: 'failure' } },
      'Outbox run did not finish before shutdown; its claimed entries will be retried once the claim expires'
    )
  }
}

export { startOutbox, stopOutbox }
