export const entraTenantsArray = {
  name: 'entra-tenants-array',
  validate: (val) => {
    if (val === null || val === '') return

    let arr = val
    if (typeof val === 'string') {
      try {
        arr = JSON.parse(val)
      } catch (e) {
        throw new Error('AUTH_ENTRA_TENANTS must be valid JSON')
      }
    }

    if (!Array.isArray(arr)) throw new Error('Must be an array of tenant configs')

    const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
    const uuidRegex = new RegExp(`^${uuidPattern}$`)

    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') throw new Error('Each tenant must be an object with tenantId and allowedGroupIds')
      const { tenantId, allowedGroupIds } = entry
      if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') throw new Error('tenantId must be a non-empty string')
      if (!Array.isArray(allowedGroupIds) || allowedGroupIds.length === 0) throw new Error('allowedGroupIds must be a non-empty array of UUIDs')
      for (const uuid of allowedGroupIds) {
        if (typeof uuid !== 'string' || !uuidRegex.test(uuid)) throw new Error('allowedGroupIds must contain only valid UUID strings')
      }
    }
  },
  coerce: (val) => {
    if (Array.isArray(val)) return val
    if (val === null || val === '') return []
    if (typeof val === 'string') {
      return JSON.parse(val)
    }
    return val
  }
}
