import convict from 'convict'

import { serverConfig } from './server.js'
import { uploaderConfig } from './uploader.js'
import { databaseConfig } from './database.js'
import { hapiSwaggerConfig } from './hapi-swagger.js'
import { s3Config } from './s3.js'

const config = convict({
  ...serverConfig,
  ...uploaderConfig,
  ...databaseConfig,
  ...hapiSwaggerConfig,
  ...s3Config
})

config.validate({ allowed: 'strict' })

export { config }
