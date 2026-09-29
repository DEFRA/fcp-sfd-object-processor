import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'

import { createServer } from '../../../../../../src/api/index'
import { StatusCodes } from 'http-status-codes'

vi.mock('../../../../../../src/data/db.js', () => ({
  connectDb: vi.fn(),
  closeDb: vi.fn(),
  getDb: vi.fn(),
  getClient: vi.fn()
}))

describe('#healthHandler', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected response', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/health'
    })

    expect(result).toEqual({ message: 'success' })
    expect(statusCode).toBe(StatusCodes.OK)
  })
})
