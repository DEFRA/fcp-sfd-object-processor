import { config } from '../../../src/config/index.js'
import { createLogger } from '../../logging/logger.js'
import { buildOutboxPollFailureLog } from '../../utils/build-outbox-poll-failure-log.js'

import { publishPendingMessages } from './crm/doc-upload/publish-pending-messages.js'

const logger = createLogger()

// This is the only place a failed run is logged. The run never rejects, so a
// failure at boot does not stop the process and a failure from the timer does
// not reach the unhandledRejection handler. The next run is always scheduled.
const startOutbox = async () => {
  try {
    await publishPendingMessages()
  } catch (error) {
    logger.error(buildOutboxPollFailureLog(error), 'Outbox processing failed')
  } finally {
    setTimeout(startOutbox, config.get('messaging.outboxIntervalMs'))
  }
}

export { startOutbox }
