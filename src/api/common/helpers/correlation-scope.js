import { enterCorrelationScope } from '../../../logging/correlation-id-store.js'

// Entering the scope at onRequest, before the requestLogger plugin runs, means every log
// line the request emits, including hapi-pino's own [response] line, can read a correlation
// id once one is set. See src/api/index.js for the registration order this depends on.
const correlationScope = {
  plugin: {
    name: 'correlation-scope',
    register: (server) => {
      server.ext('onRequest', (request, h) => {
        enterCorrelationScope()
        return h.continue
      })
    }
  }
}

export { correlationScope }
