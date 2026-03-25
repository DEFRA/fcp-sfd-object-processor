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
  return val
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
      const d = error.details && error.details[0]
      if (d) {
        const p = d.path || []
        const msg = d.message || ''
        if (p.length === 0 && (d.type === 'array.base' || /must be an array/.test(msg))) {
          throw new TypeError('Must be an array of tenant configs')
        }
        if (p.length === 1 && p[0] === 0 && /must be of type object|must be an object/.test(msg)) {
          throw new TypeError('Each tenant must be an object with tenantId and allowedGroupIds')
        }
        if (String(p).endsWith('tenantId')) {
          throw new TypeError('tenantId must be a non-empty string')
        }
        if (String(p).endsWith('allowedGroupIds')) {
          if (/must be an array/.test(msg) || d.type === 'array.base') {
            throw new TypeError('allowedGroupIds must be a non-empty array of UUIDs')
          }
          if (d.type === 'array.min' || /contain at least/.test(msg) || /at least 1 items/.test(msg)) {
            throw new TypeError('allowedGroupIds must be a non-empty array of UUIDs')
          }
        }
        if (/valid GUID|valid guid|must be a valid GUID/.test(msg) || /must be a valid guid/.test(msg)) {
          throw new TypeError('allowedGroupIds must contain only valid UUID strings')
        }
      }
      throw new TypeError(error.message)
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
      return JSON.parse(val)
    }
    return val
  }
}
