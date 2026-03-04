export const endpointPath = {
  name: 'endpoint-path',
  validate (value) {
    if (typeof value !== 'string') {
      throw new Error('must be a string')
    }
    if (!value.startsWith('/')) {
      throw new Error('must start with a forward slash (/)')
    }
  }
}
