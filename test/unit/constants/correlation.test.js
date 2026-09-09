import { describe, expect, test } from 'vitest'

import { JOURNEY_ID_KEY } from '../../../src/constants/correlation.js'

describe('constants/correlation', () => {
  test('JOURNEY_ID_KEY is the metadata key the journey id travels under', () => {
    // Shared by the initiate handler, which sets it on the outbound uploader metadata,
    // and the callback route, which reads it back off the echoed metadata. A drift
    // between the two would silently break correlation.
    expect(JOURNEY_ID_KEY).toBe('journeyId')
  })
})
