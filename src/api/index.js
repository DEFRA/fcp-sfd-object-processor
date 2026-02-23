import path from 'node:path'
import hapi from '@hapi/hapi'
import hapiSwagger from 'hapi-swagger'
import Inert from '@hapi/inert'
import Vision from '@hapi/vision'
import Jwt from '@hapi/jwt'

import { config } from '../config/index.js'
import { router } from './router.js'
import { requestLogger } from './common/helpers/request-logger.js'
import { secureContext } from './common/helpers/secure-context/secure-context.js'
import { pulse } from './common/helpers/pulse.js'
import { requestTracing } from './common/helpers/request-tracing.js'
import { setupProxy } from './common/helpers/proxy/setup-proxy.js'
import { auth } from '../plugins/auth.js'

const createServer = async () => {
  setupProxy()

  const server = hapi.server({
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        }
      },
      files: {
        relativeTo: path.resolve(config.get('root'), '.public')
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  await server.register([
    Jwt,
    auth,
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    router,
    Inert,
    Vision,
    {
      plugin: hapiSwagger,
      options: config.get('hapiSwagger')
    }
  ])
  return server
}

export { createServer }
