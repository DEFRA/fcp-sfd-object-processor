import { describe, expect, test } from 'vitest'

import {
  enterCorrelationScope,
  getCorrelationId,
  runWithCorrelationId,
  setCorrelationId
} from '../../../src/logging/correlation-id-store.js'

describe('correlation ID store', () => {
  test('makes the correlation ID available throughout an asynchronous scope', async () => {
    await runWithCorrelationId('correlation-1', async () => {
      expect(getCorrelationId()).toBe('correlation-1')
      await Promise.resolve()
      expect(getCorrelationId()).toBe('correlation-1')
    })

    expect(getCorrelationId()).toBeUndefined()
  })

  test('keeps concurrent correlation scopes isolated', async () => {
    const values = await Promise.all([
      runWithCorrelationId('correlation-1', async () => {
        await Promise.resolve()
        return getCorrelationId()
      }),
      runWithCorrelationId('correlation-2', async () => {
        await Promise.resolve()
        return getCorrelationId()
      })
    ])

    expect(values).toEqual(['correlation-1', 'correlation-2'])
  })

  test('leaves the correlation ID undefined after entering a scope until it is set', () => {
    enterCorrelationScope()

    expect(getCorrelationId()).toBeUndefined()
  })

  test('makes a value set after entering a scope visible across a later await', async () => {
    enterCorrelationScope()
    setCorrelationId('correlation-3')

    await Promise.resolve()

    expect(getCorrelationId()).toBe('correlation-3')
  })

  test('does not throw when setting a correlation ID outside any entered scope', () => {
    expect(() => setCorrelationId('correlation-4')).not.toThrow()
    expect(getCorrelationId()).toBeUndefined()
  })

  test('keeps concurrent entered scopes isolated from one another', async () => {
    const enterSetAndRead = async (id) => {
      enterCorrelationScope()
      setCorrelationId(id)
      await Promise.resolve()
      return getCorrelationId()
    }

    const values = await Promise.all([
      enterSetAndRead('correlation-5'),
      enterSetAndRead('correlation-6')
    ])

    expect(values).toEqual(['correlation-5', 'correlation-6'])
  })
})
