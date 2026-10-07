import Boom from '@hapi/boom'

import { createLogger } from '../../../logging/logger.js'
import {
  buildResponseValidationFailureLog,
  RESPONSE_VALIDATION_FAILED
} from '../../../utils/build-response-validation-failure-log.js'

const logger = createLogger()

/**
 * Response validation failAction that logs the failing field paths only and returns a 500.
 * Hapi's default behaviour logs the Joi error itself, whose message, details and _original can
 * carry response values such as a CRN. A new error is thrown in its place so that nothing from
 * the response reaches the log or the client.
 * @param {object} request - Hapi request object
 * @param {object} _h - Hapi response toolkit
 * @param {Error} err - Joi validation error raised by Hapi's response validation
 */
export const responseFailAction = (request, _h, err) => {
  logger.error(buildResponseValidationFailureLog(request, err), RESPONSE_VALIDATION_FAILED)
  throw Boom.internal(RESPONSE_VALIDATION_FAILED)
}
