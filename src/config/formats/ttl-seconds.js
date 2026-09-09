const MIN_TTL_SECONDS = 60

export const ttlSeconds = {
  name: 'ttl-seconds',
  coerce (value) {
    return typeof value === 'string' ? Number.parseInt(value, 10) : value
  },
  validate (value) {
    if (!Number.isInteger(value) || value < MIN_TTL_SECONDS) {
      throw new Error(`must be an integer of at least ${MIN_TTL_SECONDS} seconds`)
    }
  }
}
