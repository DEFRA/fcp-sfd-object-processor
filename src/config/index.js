import convict from 'convict'

import { serverConfig } from './server.js'

const config = convict({
  ...serverConfig
})

config.validate({ allowed: 'strict' })

export { config }
