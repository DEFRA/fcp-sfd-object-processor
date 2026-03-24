import { mimeTypePattern } from '../../constants/mime-types.js'

function validate (val) {
  if (val === null || val === '') {
    return
  }

  if (Array.isArray(val) && val.length === 0) {
    return
  }

  const mimeTypes = Array.isArray(val) ? val : val.split(',')

  for (const mimeType of mimeTypes) {
    if (typeof mimeType !== 'string' || !mimeTypePattern.test(mimeType)) {
      throw new Error('Must be a comma separated list of valid MIME types')
    }
  }
}

function coerce (val) {
  if (val === null || val === '') {
    return []
  }

  if (Array.isArray(val)) {
    return val
  }

  return val.split(',')
}

export const mimeTypeArray = {
  name: 'mime-type-array',
  validate,
  coerce
}
