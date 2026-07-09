function validate (val) {
  const types = Array.isArray(val) ? val : (val ? val.split(',') : [])

  if (types.length === 0) {
    throw new Error('CDP_UPLOADER_DOCUMENT_TYPES must contain at least one document type')
  }

  for (const type of types) {
    if (typeof type !== 'string' || type.trim().length === 0) {
      throw new Error('Must be a comma separated list of non-empty document type strings')
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

  return val.split(',').map(t => t.trim())
}

export const documentTypeArray = {
  name: 'document-type-array',
  validate,
  coerce
}
