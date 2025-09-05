import { health } from './health/index.js'
import { initiateUpload } from './initiate/index.js'

const router = {
  plugin: {
    name: 'Router',
    register: async (server) => {
      await server.register([health])
      await server.route(initiateUpload) // does this need await?
    }
  }
}

export { router }
