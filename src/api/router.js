import { health } from './health/index.js'
import { initiateUpload } from './initiate/index.js'
import { uploadCallback } from './callback/index.js'

const router = {
  plugin: {
    name: 'Router',
    register: async (server) => {
      await server.register([health])
      server.route(initiateUpload)
      server.route(uploadCallback)
    }
  }
}

export { router }
