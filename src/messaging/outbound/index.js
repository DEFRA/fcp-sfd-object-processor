import { config } from '../../../src/config/index.js'

import { publishPendingMessages } from './crm/doc-upload/publish-pending-messages.js'

const startOutbox = async () => {
  try {
    await publishPendingMessages()
  } catch (error) {
    throw new Error(`Outbox processing failed: ${error.message}`, error)
    // Emit failure event - separate PR
  } finally {
    setTimeout(startOutbox, config.get('messaging.outboxIntervalMs'))
  }
}

export { startOutbox }
