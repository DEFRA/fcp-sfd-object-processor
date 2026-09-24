import { config } from '../../../config/index.js'
import { createServer } from '../../index.js'

// Errors are not caught here: a failed start must reject so that src/index.js
// stops before starting the outbox processor, and the process exits.
const startServer = async () => {
  const server = await createServer()
  await server.start()

  server.logger.info('Server started successfully')
  server.logger.info(
    `Access your backend on http://localhost:${config.get('port')}`
  )

  return server
}

export { startServer }
