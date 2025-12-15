import convict from 'convict'

import { serverConfig } from './server.js'
import { uploaderConfig } from './uploader.js'
import { databaseConfig } from './database.js'
import { hapiSwaggerConfig } from './hapi-swagger.js'
import { s3Config } from './s3.js'
import { messagingConfig } from './messaging.js'
import { awsConfig } from './aws.js'

const config = convict({
  ...serverConfig,
  ...uploaderConfig,
  ...databaseConfig,
  ...hapiSwaggerConfig,
  ...s3Config,
  ...messagingConfig,
  ...awsConfig
})

config.validate({ allowed: 'strict' })

export { config }
