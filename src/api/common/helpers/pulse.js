import hapiPulse from 'hapi-pulse'
import { createLogger } from '../../../logging/logger.js'
import { closeDb } from '../../../data/db.js'
import { stopOutbox } from '../../../messaging/outbound/index.js'

const tenSeconds = 10 * 1000

const pulse = {
  plugin: hapiPulse,
  options: {
    logger: createLogger(),
    timeout: tenSeconds,
    // Both hooks run only on a shutdown signal; server.stop() in tests does not
    // trigger them. hapi-pulse awaits preServerStop before postServerStop.
    // stopOutbox resolves when any in-flight outbox run has finished, or when
    // messaging.outboxDrainTimeoutMs has elapsed, whichever comes first. A run
    // abandoned at that limit may still be using the client when closeDb runs;
    // its claimed entries are retried once the claim expires.
    preServerStop: stopOutbox,
    postServerStop: closeDb
  }
}

export { pulse }
