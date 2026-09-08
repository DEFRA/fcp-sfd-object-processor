import { describe, expect, test } from 'vitest'

import { JOURNEY_ID_PARAM } from '../../../src/constants/correlation.js'

describe('constants/correlation', () => {
  test('JOURNEY_ID_PARAM is the query parameter name used on the callback URL', () => {
    // Shared by the initiate handler, which appends it, and the callback route, which
    // reads it back. A drift between the two would silently break correlation.
    expect(JOURNEY_ID_PARAM).toBe('journeyId')
  })
})
