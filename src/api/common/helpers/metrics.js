import {
  createMetricsLogger,
  Unit,
  StorageResolution
} from 'aws-embedded-metrics'

import { config } from '../../../config/index.js'
import { createLogger } from '../../../logging/logger.js'

const metricsCounter = async (metricName, value = 1, dimensions = {}) => {
  const isMetricsEnabled = config.get('isMetricsEnabled')

  if (!isMetricsEnabled) {
    return
  }

  try {
    const metricsLogger = createMetricsLogger()
    if (Object.keys(dimensions).length) {
      metricsLogger.putDimensions(dimensions)
    }
    metricsLogger.putMetric(
      metricName,
      value,
      Unit.Count,
      StorageResolution.Standard
    )
    await metricsLogger.flush()
  } catch (error) {
    createLogger().error(error, error.message)
  }
}

const metricsGauge = async (metricName, value, dimensions = {}) => {
  const isMetricsEnabled = config.get('isMetricsEnabled')

  if (!isMetricsEnabled) {
    return
  }

  try {
    const metricsLogger = createMetricsLogger()
    if (Object.keys(dimensions).length) {
      metricsLogger.putDimensions(dimensions)
    }
    metricsLogger.putMetric(
      metricName,
      value,
      Unit.None,
      StorageResolution.Standard
    )
    await metricsLogger.flush()
  } catch (error) {
    createLogger().error(error, error.message)
  }
}

export { metricsCounter, metricsGauge }
