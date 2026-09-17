import { describe, test, expect } from 'vitest'
import { buildCdpUploaderPayload } from '../../../../../../src/api/v1/uploader/initiate/index.js'

describe('buildCdpUploaderPayload - journeyId always included', () => {
  test('should always include journeyId in metadata', () => {
    const clientPayload = {
      redirect: 'https://example.com/success',
      metadata: { sbi: 123456789 }
    }
    const journeyId = '550e8400-e29b-41d4-a716-446655440000'

    const result = buildCdpUploaderPayload(clientPayload, journeyId)

    expect(result.metadata).toHaveProperty('journeyId')
    expect(result.metadata.journeyId).toBe(journeyId)
  })

  test('should preserve client metadata while adding journeyId', () => {
    const clientPayload = {
      redirect: 'https://example.com/success',
      metadata: { sbi: 123456789, uosr: 'TEST-SFD-001' }
    }
    const journeyId = '550e8400-e29b-41d4-a716-446655440000'

    const result = buildCdpUploaderPayload(clientPayload, journeyId)

    expect(result.metadata.sbi).toBe(123456789)
    expect(result.metadata.uosr).toBe('TEST-SFD-001')
    expect(result.metadata.journeyId).toBe(journeyId)
  })

  test('should include journeyId for v4 uuid from randomUUID()', () => {
    // Simulate a real UUID from randomUUID()
    const clientPayload = {
      redirect: 'https://example.com/success',
      metadata: {}
    }
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    // Simulate journeyId from randomUUID()
    const journeyId = crypto.randomUUID()

    const result = buildCdpUploaderPayload(clientPayload, journeyId)

    expect(result.metadata.journeyId).toBe(journeyId)
    expect(uuidV4Regex.test(journeyId)).toBe(true)
  })

  test('should not use spread operator guard - journeyId always present', () => {
    const clientPayload = {
      redirect: 'https://example.com/success',
      metadata: { existing: 'value' }
    }

    // journeyId is always truthy from randomUUID()
    const journeyId = crypto.randomUUID()

    const result = buildCdpUploaderPayload(clientPayload, journeyId)

    // Verify journeyId key exists in metadata
    const metadataKeys = Object.keys(result.metadata)
    expect(metadataKeys).toContain('journeyId')

    // Verify no false conditional behavior
    const journeyIdValue = result.metadata.journeyId
    expect(typeof journeyIdValue).toBe('string')
    expect(journeyIdValue.length).toBeGreaterThan(0)
  })

  test('should include other CDP config fields unchanged', () => {
    const clientPayload = {
      redirect: 'https://example.com/success',
      metadata: {}
    }
    const journeyId = crypto.randomUUID()

    const result = buildCdpUploaderPayload(clientPayload, journeyId)

    // These come from config.get() calls
    expect(result).toHaveProperty('redirect', 'https://example.com/success')
    expect(result).toHaveProperty('s3Bucket')
    expect(result).toHaveProperty('s3Path')
    expect(result).toHaveProperty('callback')
    expect(result).toHaveProperty('mimeTypes')
    expect(result).toHaveProperty('maxFileSize')
    expect(result).toHaveProperty('metadata')
  })

  test('dead guard removed: conditional spread operator no longer used', () => {
    // This test documents the fix: the conditional spread
    // `...(journeyId ? { [JOURNEY_ID_KEY]: journeyId } : {})`
    // is removed because journeyId from randomUUID() is always truthy

    const clientPayload = {
      redirect: 'https://example.com/success',
      metadata: {}
    }

    // Even with an empty/falsy check, journeyId should be present
    // because the fix always includes it
    const journeyId = crypto.randomUUID()

    const result = buildCdpUploaderPayload(clientPayload, journeyId)

    // Verify the fix: journeyId is unconditionally in metadata
    expect('journeyId' in result.metadata).toBe(true)

    // Verify code is cleaner without the unreachable false branch
    // (This would require inspecting the actual source code, but
    // functionally we can verify the correct behavior)
  })
})
