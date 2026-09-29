import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createServer } from '../../../src/api/index.js'
import { connectDb } from '../../../src/data/db.js'

const { registeredSecureContext } = vi.hoisted(() => ({
  registeredSecureContext: { context: 'from-secure-context-plugin' }
}))

vi.mock('../../../src/data/db.js', () => ({
  connectDb: vi.fn(),
  closeDb: vi.fn(),
  getDb: vi.fn(),
  getClient: vi.fn()
}))

// The real plugin decorates server.secureContext only when the secure context is
// enabled, which it is not in tests. This stand-in always decorates a known object,
// so the test fails if mongoDb is registered before it and receives undefined.
vi.mock('../../../src/api/common/helpers/secure-context/secure-context.js', () => ({
  secureContext: {
    plugin: {
      name: 'secure-context',
      register (server) {
        server.decorate('server', 'secureContext', registeredSecureContext)
      }
    }
  }
}))

describe('createServer', () => {
  let server

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await server?.stop({ timeout: 0 })
  })

  test('connects to MongoDB with the secure context registered before it', async () => {
    server = await createServer()

    expect(connectDb).toHaveBeenCalledTimes(1)
    expect(connectDb).toHaveBeenCalledWith(registeredSecureContext)
  })
})
