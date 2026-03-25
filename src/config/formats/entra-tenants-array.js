const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const uuidRegex = new RegExp(`^${uuidPattern}$`)

const parseTenantArray = (val) => {
  if (Array.isArray(val)) {
    return val
  }
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch (e) {
      throw new Error('AUTH_ENTRA_TENANTS must be valid JSON')
    }
  }
  return val
}

const validateTenantEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Each tenant must be an object with tenantId and allowedGroupIds')
  }
  const { tenantId, allowedGroupIds } = entry

  const validateTenantId = (id) => {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new Error('tenantId must be a non-empty string')
    }
  }

  const isUuidString = (s) => {
    return typeof s === 'string' && uuidRegex.test(s)
  }

  const validateAllowedGroupIds = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error('allowedGroupIds must be a non-empty array of UUIDs')
    }
    for (const uuid of arr) {
      if (!isUuidString(uuid)) {
        throw new Error('allowedGroupIds must contain only valid UUID strings')
      }
    }
  }

  validateTenantId(tenantId)
  validateAllowedGroupIds(allowedGroupIds)
}

export const entraTenantsArray = {
  name: 'entra-tenants-array',
  validate: (val) => {
    if (val === null || val === '') {
      return
    }

    const arr = parseTenantArray(val)

    if (!Array.isArray(arr)) {
      throw new Error('Must be an array of tenant configs')
    }

    for (const entry of arr) {
      validateTenantEntry(entry)
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
