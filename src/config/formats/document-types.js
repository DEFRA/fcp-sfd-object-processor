function parseTypes (val) {
  if (Array.isArray(val)) {
    return val
  } else if (val) {
    return val.split(',')
  } else {
    return []
  }
}

function validate (val) {
  const types = parseTypes(val)

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
  const types = parseTypes(val)

  return Array.isArray(val) ? types : types.map(t => t.trim())
}

export const documentTypeArray = {
  name: 'document-type-array',
  validate,
  coerce
}
