import { health } from './health/index.js'
import { blobRoute } from './v1/blobs/index.js'
import { uploadCallback } from './v1/callback/index.js'
import { metadataRoute } from './v1/metadata/index.js'

const router = {
  plugin: {
    name: 'Router',
    register: async (server) => {
      await server.register([health])
      server.route(uploadCallback)
      server.route(metadataRoute)
      server.route(blobRoute)
    }
  }
}

export { router }
