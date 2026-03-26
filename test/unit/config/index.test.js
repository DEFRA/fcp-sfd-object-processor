import { beforeEach, describe, expect, test, vi } from 'vitest'

// Prepare spies as top-level variables so the mock factory (which is hoisted)
// can reference them when Vitest transforms the file.
let addFormat
let validate
let set

vi.mock('convict', () => {
  // default export is a function that returns the config instance
  const convictFn = () => ({ set, validate })
  convictFn.addFormat = (...args) => addFormat(...args)
  return { default: convictFn }
})

describe('config/index.js', () => {
  beforeEach(() => {
    vi.resetModules()
    // reset spies and env between tests
    addFormat = vi.fn()
    validate = vi.fn()
    set = vi.fn()
    delete process.env.AUTH_ENTRA_TENANTS
    delete process.env.AUTH_ENTRA_TENANT_ID
    delete process.env.AUTH_ENTRA_ALLOWED_GROUP_IDS
  })

  test('registers formats, sets tenants from legacy env vars and validates', async () => {
    // Provide legacy single-tenant env vars
    process.env.AUTH_ENTRA_TENANT_ID = 'tenant-1'
    process.env.AUTH_ENTRA_ALLOWED_GROUP_IDS = 'g1,g2'

    await import('../../../src/config/index.js')

    // addFormat should be called for each custom format registered
    expect(addFormat).toHaveBeenCalled()

    // config.set should be called to set auth.entra.tenants from legacy envs
    expect(set).toHaveBeenCalledWith('auth.entra.tenants', [
      { tenantId: 'tenant-1', allowedGroupIds: ['g1', 'g2'] }
    ])

    // validate should be invoked with strict mode
    expect(validate).toHaveBeenCalledWith({ allowed: 'strict' })
  })

  test('does not set tenants from legacy env when AUTH_ENTRA_TENANTS present', async () => {
    process.env.AUTH_ENTRA_TENANTS = JSON.stringify([{ tenantId: 't', allowedGroupIds: [] }])
    process.env.AUTH_ENTRA_TENANT_ID = 'tenant-should-not-be-used'

    await import('../../../src/config/index.js')

    expect(addFormat).toHaveBeenCalled()
    // set should not be called because AUTH_ENTRA_TENANTS is present
    expect(set).not.toHaveBeenCalledWith('auth.entra.tenants', expect.anything())
    expect(validate).toHaveBeenCalledWith({ allowed: 'strict' })
  })

  test('sets tenants with empty allowedGroupIds when allowed env missing', async () => {
    // legacy single-tenant env var present but no allowed groups env
    process.env.AUTH_ENTRA_TENANT_ID = 'tenant-2'

    await import('../../../src/config/index.js')

    expect(addFormat).toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith('auth.entra.tenants', [
      { tenantId: 'tenant-2', allowedGroupIds: [] }
    ])
    expect(validate).toHaveBeenCalledWith({ allowed: 'strict' })
  })
})
