import convict from 'convict'

import { serverConfig } from './server.js'
import { uploaderConfig } from './uploader.js'
import { databaseConfig } from './database.js'

const config = convict({
  ...serverConfig,
  ...uploaderConfig,
  ...databaseConfig
})

config.validate({ allowed: 'strict' })

export { config }
