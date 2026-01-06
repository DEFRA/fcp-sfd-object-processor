import convict from 'convict'

import { serverConfig } from './server.js'
import { uploaderConfig } from './uploader.js'
import { databaseConfig } from './database.js'
import { hapiSwaggerConfig } from './hapi-swagger.js'
import { awsConfig } from './aws.js'

const config = convict({
  ...serverConfig,
  ...uploaderConfig,
  ...databaseConfig,
  ...hapiSwaggerConfig,
  ...awsConfig
})

config.validate({ allowed: 'strict' })

export { config }
