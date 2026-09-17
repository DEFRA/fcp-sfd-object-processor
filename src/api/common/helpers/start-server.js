import { config } from '../../../config/index.js'
import { createServer } from '../../index.js'
import { createLogger } from '../../../logging/logger.js'
import { connectDb } from '../../../data/db.js'

const startServer = async () => {
  let server

  try {
    server = await createServer()
    await connectDb(server.secureContext)
    await server.start()

    server.logger.info('Server started successfully')
    server.logger.info(
      `Access your backend on http://localhost:${config.get('port')}`
    )
  } catch (error) {
    const logger = createLogger()
    logger.info('Server failed to start :(')
    logger.error(error)
  }

  return server
}

export { startServer }
