import process from 'node:process'

import { createLogger } from './logging/logger.js'
import { startServer } from './api/common/helpers/start-server.js'
import { startOutbox } from './messaging/outbound/index.js'

const logger = createLogger()

// Catches rejections that nothing else handles, such as one from a timer. It
// does not catch a rejected top-level await below: Node prints that error and
// exits with code 1. That exit is what stops the outbox starting when
// startServer fails, so the awaits below must not be wrapped in a catch.
process.on('unhandledRejection', (error) => {
  logger.info('Unhandled rejection')
  logger.error(error)
  process.exitCode = 1
})

await startServer()
await startOutbox()
logger.info('Outbox processor enabled.')
