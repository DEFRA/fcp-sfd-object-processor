import convict from 'convict'

import { serverConfig } from './server.js'
import { uploaderConfig } from './uploader.js'

const config = convict({
  ...serverConfig,
  ...uploaderConfig
})

config.validate({ allowed: 'strict' })

export { config }
