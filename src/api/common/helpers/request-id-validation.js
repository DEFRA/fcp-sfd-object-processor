import Boom from '@hapi/boom'

import { config } from '../../../config/index.js'
import { MAX_CORRELATION_ID_LENGTH } from '../../../constants/correlation.js'
import { createLogger } from '../../../logging/logger.js'
import { buildOversizedRequestIdLog } from '../../../utils/build-oversized-request-id-log.js'

const logger = createLogger()
const tracingHeader = config.get('tracing.header')
export const rejectOversizedRequestId = (request, h) => {
  const requestId = request.headers?.[tracingHeader]

  if (typeof requestId !== 'string' || requestId.length <= MAX_CORRELATION_ID_LENGTH) {
    return h.continue
  }

  const headerLength = requestId.length
  // Hides the oversized id from later onRequest extensions.
  delete request.headers[tracingHeader]

  logger.warn(
    buildOversizedRequestIdLog(request, headerLength),
    `Request rejected because ${tracingHeader} exceeds ${MAX_CORRELATION_ID_LENGTH} characters`
  )

  throw Boom.badRequest(`${tracingHeader} header must be ${MAX_CORRELATION_ID_LENGTH} characters or fewer`)
}

const requestIdValidation = {
  plugin: {
    name: 'request-id-validation',
    register: (server) => {
      server.ext('onRequest', rejectOversizedRequestId)
    }
  }
}

export { requestIdValidation }
