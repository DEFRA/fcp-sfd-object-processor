import Joi from 'joi'
const tenantSchema = Joi.array().items(
  Joi.object({
    tenantId: Joi.string().trim().min(1).required(),
    allowedGroupIds: Joi.array().items(Joi.string().guid()).min(1).required()
  })
)

const parseTenantArray = (val) => {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch (e) {
      throw new SyntaxError('AUTH_ENTRA_TENANTS must be valid JSON', { cause: e })
    }
  }
  throw new TypeError('Must be an array of tenant configs')
}

const isTopLevelArrayError = (detail) => {
  const path = detail.path || []
  const messageText = detail.message || ''
  return path.length === 0 && (detail.type === 'array.base' || /must be an array/.test(messageText))
}

const isTenantObjectError = (detail) => {
  const path = detail.path || []
  const messageText = detail.message || ''
  return path.length === 1 && path[0] === 0 && /must be of type object|must be an object/.test(messageText)
}

const isTenantIdError = (detail) => {
  const path = detail.path || []
  return String(path).endsWith('tenantId')
}

const isAllowedGroupIdsArrayError = (detail) => {
  const path = detail.path || []
  const messageText = detail.message || ''
  return String(path).endsWith('allowedGroupIds') && (detail.type === 'array.base' || /must be an array/.test(messageText))
}

const isAllowedGroupIdsMinError = (detail) => {
  const path = detail.path || []
  const messageText = detail.message || ''
  return String(path).endsWith('allowedGroupIds') && (detail.type === 'array.min' || /contain at least/.test(messageText) || /at least 1 items/.test(messageText))
}

const isAllowedGroupIdsGuidError = (detail) => {
  const messageText = detail.message || ''
  return /valid GUID|valid guid|must be a valid GUID|must be a valid guid/.test(messageText)
}

const mapJoiError = (error) => {
  const detail = error.details?.[0]
  if (!detail) throw new TypeError(error.message)

  if (isTopLevelArrayError(detail)) {
    throw new TypeError('Must be an array of tenant configs')
  }
  if (isTenantObjectError(detail)) {
    throw new TypeError('Each tenant must be an object with tenantId and allowedGroupIds')
  }
  if (isTenantIdError(detail)) {
    throw new TypeError('tenantId must be a non-empty string')
  }
  if (isAllowedGroupIdsArrayError(detail) || isAllowedGroupIdsMinError(detail)) {
    throw new TypeError('allowedGroupIds must be a non-empty array of UUIDs')
  }
  if (isAllowedGroupIdsGuidError(detail)) {
    throw new TypeError('allowedGroupIds must contain only valid UUID strings')
  }

  throw new TypeError(error.message)
}

export const entraTenantsArray = {
  name: 'entra-tenants-array',
  validate: (val) => {
    if (val === null || val === '') return

    const arr = parseTenantArray(val)
    const { error } = tenantSchema.validate(arr)
    if (error) mapJoiError(error)
  },
  coerce: (val) => {
    if (Array.isArray(val)) return val
    if (val === null || val === '') return []
    if (typeof val === 'string') return parseTenantArray(val)
    return val
  }
}
