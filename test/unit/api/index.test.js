import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createServer } from '../../../src/api/index.js'
import { connectDb } from '../../../src/data/db.js'

vi.mock('../../../src/data/db.js', () => ({
  connectDb: vi.fn(),
  closeDb: vi.fn(),
  getDb: vi.fn(),
  getClient: vi.fn()
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

    expect(server.secureContext).toBeDefined()
    expect(connectDb).toHaveBeenCalledTimes(1)
    expect(connectDb).toHaveBeenCalledWith(server.secureContext)
  })
})
