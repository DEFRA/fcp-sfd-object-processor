import convict from 'convict'

import { serverConfig } from './server.js'
import { uploaderConfig } from './uploader.js'
import { databaseConfig } from './database.js'
import { hapiSwaggerConfig } from './hapi-swagger.js'
import { awsConfig } from './aws.js'
import { authConfig } from './auth.js'

import { securityGroupArray } from './formats/security-groups.js'

convict.addFormat(securityGroupArray)

const config = convict({
  ...serverConfig,
  ...uploaderConfig,
  ...databaseConfig,
  ...hapiSwaggerConfig,
  ...awsConfig,
  ...authConfig
})

config.validate({ allowed: 'strict' })

export { config }
