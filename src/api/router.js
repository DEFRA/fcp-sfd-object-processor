import { health } from './health/index.js'
import { initiateUpload } from './initiate/index.js'
import { uploadCallback } from './callback/index.js'
import { metadataRoute } from './metadata/index.js'

const router = {
  plugin: {
    name: 'Router',
    register: async (server) => {
      await server.register([health])
      server.route(initiateUpload)
      server.route(uploadCallback)
      server.route(metadataRoute)
    }
  }
}

export { router }
