import { describe, expect, test } from 'vitest'

import { PROCESSING } from '../../../src/constants/outbox.js'

describe('outbox constants', () => {
  test('defines the processing status', () => {
    expect(PROCESSING).toBe('PROCESSING')
  })
})
