const sanitiseReceivedValue = (value) => {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value === 'string') {
    return value.slice(0, 256)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  return '[complex value]'
}

const mapValidationErrors = (validationError) => {
  if (!validationError?.details || !Array.isArray(validationError.details)) {
    return []
  }

  return validationError.details.map((detail) => ({
    field: Array.isArray(detail.path) ? detail.path.join('.') : 'unknown',
    errorType: detail.type ?? 'unknown',
    receivedValue: sanitiseReceivedValue(detail.context?.value)
  }))
}

const getSbiFromPayload = (payload) => {
  const sbi = payload?.metadata?.sbi
  return Number.isInteger(sbi) ? sbi : null
}

const buildValidatedStatusDocuments = (documents) => {
  return documents.map(document => ({
    sbi: document.metadata.sbi,
    fileId: document.file.fileId,
    timestamp: new Date(),
    validated: true,
    errors: null
  }))
}

const extractFileIdsFromPayload = (payload) => {
  const formValues = payload?.form && typeof payload.form === 'object'
    ? Object.values(payload.form)
    : []

  const fileIds = formValues
    .filter(value => typeof value === 'object' && value !== null)
    .map(value => value.fileId)
    .filter(fileId => typeof fileId === 'string' && fileId.length > 0)

  return fileIds.length > 0 ? fileIds : ['unknown']
}

const buildValidationFailureStatusDocuments = (payload, validationError) => {
  const sbi = getSbiFromPayload(payload)
  const errors = mapValidationErrors(validationError)
  const fileIds = extractFileIdsFromPayload(payload)

  return fileIds.map(fileId => ({
    sbi,
    fileId,
    timestamp: new Date(),
    validated: false,
    errors
  }))
}

export {
  mapValidationErrors,
  buildValidatedStatusDocuments,
  buildValidationFailureStatusDocuments
}
