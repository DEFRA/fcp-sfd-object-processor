import { config } from '../../../config/index.js'
import { createServer } from '../../index.js'
import { createLogger } from '../../../logging/logger.js'
import { buildServerStartFailureLog } from '../../../utils/build-server-start-failure-log.js'

// A failed start is logged and then rethrown, so that src/index.js stops before
// starting the outbox processor and the process exits.
const startServer = async () => {
  try {
    const server = await createServer()
    await server.start()

    server.logger.info('Server started successfully')
    server.logger.info(
      `Access your backend on http://localhost:${config.get('port')}`
    )

    return server
  } catch (error) {
    createLogger().error(buildServerStartFailureLog(error), 'Server failed to start')
    throw error
  }
}

export { startServer }
