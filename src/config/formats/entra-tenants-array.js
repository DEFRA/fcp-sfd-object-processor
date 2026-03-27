import Joi from 'joi'

const tenantSchema = Joi.array().items(
  Joi.object({
    tenantId: Joi.string().trim().min(1).required(),
    allowedGroupIds: Joi.array().items(Joi.string().guid()).min(1).required()
  })
)

const parseTenantArray = (val) => {
  if (Array.isArray(val)) {
    return val
  }
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch (e) {
      throw new SyntaxError('AUTH_ENTRA_TENANTS must be valid JSON', { cause: e })
    }
  }
  throw new TypeError('Must be an array of tenant configs')
}
const isTopLevelArrayError = (d) => {
  const p = d.path || []
  const msg = d.message || ''
  return p.length === 0 && (d.type === 'array.base' || /must be an array/.test(msg))
}

const isTenantObjectError = (d) => {
  const p = d.path || []
  const msg = d.message || ''
  return p.length === 1 && p[0] === 0 && /must be of type object|must be an object/.test(msg)
}

const isTenantIdError = (d) => {
  const p = d.path || []
  return String(p).endsWith('tenantId')
}

const isAllowedGroupIdsArrayError = (d) => {
  const p = d.path || []
  const msg = d.message || ''
  return String(p).endsWith('allowedGroupIds') && (d.type === 'array.base' || /must be an array/.test(msg))
}

const isAllowedGroupIdsMinError = (d) => {
  const p = d.path || []
  const msg = d.message || ''
  return String(p).endsWith('allowedGroupIds') && (d.type === 'array.min' || /contain at least/.test(msg) || /at least 1 items/.test(msg))
}

const isAllowedGroupIdsGuidError = (d) => {
  const msg = d.message || ''
  return /valid GUID|valid guid|must be a valid GUID|must be a valid guid/.test(msg)
}

const mapJoiError = (error) => {
  const d = error.details?.[0]
  if (!d) {
    throw new TypeError(error.message)
  }

  if (isTopLevelArrayError(d)) {
    throw new TypeError('Must be an array of tenant configs')
  }
  if (isTenantObjectError(d)) {
    throw new TypeError('Each tenant must be an object with tenantId and allowedGroupIds')
  }
  if (isTenantIdError(d)) {
    throw new TypeError('tenantId must be a non-empty string')
  }
  if (isAllowedGroupIdsArrayError(d) || isAllowedGroupIdsMinError(d)) {
    throw new TypeError('allowedGroupIds must be a non-empty array of UUIDs')
  }
  if (isAllowedGroupIdsGuidError(d)) {
    throw new TypeError('allowedGroupIds must contain only valid UUID strings')
  }

  throw new TypeError(error.message)
}

export const entraTenantsArray = {
  name: 'entra-tenants-array',
  validate: (val) => {
    if (val === null || val === '') {
      return
    }

    const arr = parseTenantArray(val)
    const { error } = tenantSchema.validate(arr)
    if (error) {
      mapJoiError(error)
    }
  },
  coerce: (val) => {
    if (Array.isArray(val)) {
      return val
    }
    if (val === null || val === '') {
      return []
    }
    if (typeof val === 'string') {
      return parseTenantArray(val)
    }
    return val
  }
}
