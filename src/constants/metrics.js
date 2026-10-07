// §3.2 dimension budget: any other key is stripped before it reaches CloudWatch.
export const ALLOWED_METRIC_DIMENSION_KEYS = Object.freeze(['reason', 'route', 'outcome'])

export const METRIC_OUTCOME = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure'
})

export const PUBLISH_FAILURE_OUTCOME = Object.freeze({
  RETRYABLE: 'retryable',
  PERMANENT: 'permanent'
})
