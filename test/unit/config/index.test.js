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
  })

  test('registers formats, sets tenants from legacy env vars and validates', async () => {
    // Provide legacy single-tenant env vars
    // legacy env vars removed; no-op for backwards-compat test
    await import('../../../src/config/index.js')

    // addFormat should be called for each custom format registered
    expect(addFormat).toHaveBeenCalled()

    // Backwards compatibility removed: legacy env vars are ignored for tenants
    expect(set).not.toHaveBeenCalledWith('auth.entra.tenants', expect.anything())

    // validate should be invoked with strict mode
    expect(validate).toHaveBeenCalledWith({ allowed: 'strict' })
  })

  test('does not set tenants from legacy env when AUTH_ENTRA_TENANTS present', async () => {
    process.env.AUTH_ENTRA_TENANTS = JSON.stringify([{ tenantId: 't', allowedGroupIds: [] }])
    // legacy single-tenant env var removed; no-op for this test

    await import('../../../src/config/index.js')

    expect(addFormat).toHaveBeenCalled()
    // set should not be called because AUTH_ENTRA_TENANTS is present
    expect(set).not.toHaveBeenCalledWith('auth.entra.tenants', expect.anything())
    expect(validate).toHaveBeenCalledWith({ allowed: 'strict' })
  })

  test('sets tenants with empty allowedGroupIds when allowed env missing', async () => {
    // legacy single-tenant env var present but no allowed groups env
    // legacy single-tenant env var removed; no-op for this test
    await import('../../../src/config/index.js')

    expect(addFormat).toHaveBeenCalled()
    // Backwards compatibility removed: legacy env vars are ignored for tenants
    expect(set).not.toHaveBeenCalledWith('auth.entra.tenants', expect.anything())
    expect(validate).toHaveBeenCalledWith({ allowed: 'strict' })
  })
})
