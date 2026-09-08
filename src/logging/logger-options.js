import { ecsFormat } from '@elastic/ecs-pino-format'
import { getTraceId } from '@defra/hapi-tracing'

import { config } from '../config/index.js'
import { getCorrelationId } from './correlation-id-store.js'

const logConfig = config.get('log')
const serviceName = config.get('serviceName')
const serviceVersion = config.get('serviceVersion')

const formatters = {
  ecs: {
    ...ecsFormat({
      serviceVersion,
      serviceName
    })
  },
  'pino-pretty': { transport: { target: 'pino-pretty' } }
}

export const loggerOptions = {
  enabled: logConfig.enabled,
  ignorePaths: ['/health'],
  redact: {
    paths: logConfig.redact,
    remove: true
  },
  level: logConfig.level,
  ...formatters[logConfig.format],
  mixin: () => {
    const mixinValues = {}
    const traceId = getTraceId()
    if (traceId) {
      mixinValues.trace = { id: traceId }
    }
    const correlationId = getCorrelationId()
    if (correlationId) {
      // Must be a nested object. A flat 'transaction.id' key is not indexed by the CDP
      // ingestion pipeline, so the correlation id would not be queryable in CDP logs.
      mixinValues.transaction = { id: correlationId }
    }
    return mixinValues
  }
}
