export const positiveInt = {
  name: 'positive-int',
  coerce (value) {
    return typeof value === 'string' ? Number.parseInt(value, 10) : value
  },
  validate (value) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error('must be a positive integer')
    }
  }
}
