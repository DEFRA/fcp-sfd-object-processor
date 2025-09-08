import { health } from './health/index.js'
import { initiateUpload } from './initiate/index.js'

const router = {
  plugin: {
    name: 'Router',
    register: async (server) => {
      await server.register([health])
      server.route(initiateUpload)
    }
  }
}

export { router }
