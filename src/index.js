import process from 'node:process'

import { createLogger } from './logging/logger.js'
import { startServer } from './api/common/helpers/start-server.js'
import { startOutbox } from './messaging/outbound/index.js'

const logger = createLogger()
await startServer()
await startOutbox()
logger.info('Outbox processor enabled.')

process.on('unhandledRejection', (error) => {
  logger.info('Unhandled rejection')
  logger.error(error)
  process.exitCode = 1
})
