import { describe, test, expect, vi } from 'vitest'

import { correlationScope } from '../../../../../src/api/common/helpers/correlation-scope.js'
import { getCorrelationId, setCorrelationId } from '../../../../../src/logging/correlation-id-store.js'

describe('#correlation-scope', () => {
  test('registers an onRequest extension', async () => {
    const mockServer = { ext: vi.fn() }

    await correlationScope.plugin.register(mockServer)

    expect(mockServer.ext).toHaveBeenCalledWith('onRequest', expect.any(Function))
  })

  test('returns h.continue so the lifecycle proceeds', async () => {
    const mockServer = { ext: vi.fn() }
    await correlationScope.plugin.register(mockServer)
    const [, onRequest] = mockServer.ext.mock.calls[0]

    const mockRequest = {}
    const mockH = { continue: Symbol('continue') }

    const result = onRequest(mockRequest, mockH)

    expect(result).toBe(mockH.continue)
  })

  test('leaves the correlation id undefined until something sets it', async () => {
    const mockServer = { ext: vi.fn() }
    await correlationScope.plugin.register(mockServer)
    const [, onRequest] = mockServer.ext.mock.calls[0]

    onRequest({}, { continue: Symbol('continue') })

    expect(getCorrelationId()).toBeUndefined()
  })

  test('makes a value set after the extension runs readable afterwards', async () => {
    const mockServer = { ext: vi.fn() }
    await correlationScope.plugin.register(mockServer)
    const [, onRequest] = mockServer.ext.mock.calls[0]

    onRequest({}, { continue: Symbol('continue') })
    setCorrelationId('correlation-1')

    expect(getCorrelationId()).toBe('correlation-1')
  })
})
