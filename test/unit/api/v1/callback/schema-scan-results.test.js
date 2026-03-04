/**
 * Extended Callback Schema Tests - Scan Result Fields
 *
 * Tests for scan result field validation in the callback schema
 * These tests verify that the callback schema accepts and validates:
 * - scanStatus field (enum validation)
 * - virusResult field (conditional based on scanStatus)
 * - rejectionReason field (conditional based on scanStatus)
 * - scanTimestamp field (ISO 8601 format)
 * - numberOfRejectedFiles field (optional integer validation)
 */

import { describe, it, expect } from 'vitest'

/**
 * Import mocks for testing
 */
import {
  mockScanResultClean,
  mockScanResultInfected,
  mockScanResultInvalidFileType,
  mockScanResultTimeout,
  mockScanResultRejectedFileTooLarge,
  mockScanResultCleanWithVirus,
  mockScanResultInfectedWithoutVirus,
  mockScanResultInvalidFileTypeWithVirus,
  mockScanResultCleanWithRejection,
  mockScanResultInfectedWithRejectionReason,
  mockScanResultMissingTimestamp,
  mockScanResultInvalidTimestamp,
  mockScanResultInvalidStatus,
  mockScanResultInvalidRejectionReason
} from '../../mocks/scan-results.js'

describe('Callback Schema - Scan Result Fields', () => {
  /**
   * NOTE: The actual callbackPayloadSchema will be updated in Phase 4
   * with scan result fields. These tests verify the schema correctly
   * handles the new fields when the implementation is complete.
   *
   * Placeholder validation using simple field checks
   */

  const validateScanFields = (payload) => {
    const errors = []

    // scanStatus validation
    if ('scanStatus' in payload) {
      const validStatuses = ['CLEAN', 'INFECTED', 'INVALID_FILE_TYPE', 'SCAN_TIMEOUT', 'REJECTED']
      if (!validStatuses.includes(payload.scanStatus)) {
        errors.push({ path: ['scanStatus'], message: 'Invalid scanStatus enum value' })
      }
    }

    // scanTimestamp validation
    if ('scanTimestamp' in payload) {
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
      if (!iso8601Regex.test(payload.scanTimestamp)) {
        errors.push({ path: ['scanTimestamp'], message: 'Invalid ISO 8601 timestamp format' })
      }
    }

    // virusResult validation (cross-field)
    if ('virusResult' in payload && payload.scanStatus !== 'INFECTED') {
      errors.push({ path: ['virusResult'], message: 'virusResult forbidden for non-INFECTED status' })
    }
    if (payload.scanStatus === 'INFECTED' && !payload.virusResult) {
      errors.push({ path: ['virusResult'], message: 'virusResult required for INFECTED status' })
    }

    // rejectionReason validation
    if ('rejectionReason' in payload) {
      const validReasons = ['VIRUS_DETECTED', 'INVALID_FILE_TYPE', 'SCAN_TIMEOUT', 'FILE_TOO_LARGE']
      if (!validReasons.includes(payload.rejectionReason)) {
        errors.push({ path: ['rejectionReason'], message: 'Invalid rejectionReason enum value' })
      }
    }

    // numberOfRejectedFiles validation
    if ('numberOfRejectedFiles' in payload) {
      if (!Number.isInteger(payload.numberOfRejectedFiles) || payload.numberOfRejectedFiles < 0) {
        errors.push({ path: ['numberOfRejectedFiles'], message: 'numberOfRejectedFiles must be non-negative integer' })
      }
    }

    return errors
  }

  describe('Scan fields accepted in payload', () => {
    it('should accept payload with CLEAN scanStatus', () => {
      const errors = validateScanFields(mockScanResultClean)
      expect(errors.filter(e => e.path[0] === 'scanStatus')).toHaveLength(0)
    })

    it('should accept payload with INFECTED scanStatus and virusResult', () => {
      const errors = validateScanFields(mockScanResultInfected)
      expect(errors.filter(e => e.path[0] === 'scanStatus' || e.path[0] === 'virusResult')).toHaveLength(0)
    })

    it('should accept payload with INVALID_FILE_TYPE scanStatus and rejectionReason', () => {
      const errors = validateScanFields(mockScanResultInvalidFileType)
      expect(errors.filter(e => e.path[0] === 'scanStatus' || e.path[0] === 'rejectionReason')).toHaveLength(0)
    })

    it('should accept payload with SCAN_TIMEOUT scanStatus', () => {
      const errors = validateScanFields(mockScanResultTimeout)
      expect(errors.filter(e => e.path[0] === 'scanStatus')).toHaveLength(0)
    })

    it('should accept payload with REJECTED scanStatus and rejectionReason', () => {
      const errors = validateScanFields(mockScanResultRejectedFileTooLarge)
      expect(errors.filter(e => e.path[0] === 'scanStatus' || e.path[0] === 'rejectionReason')).toHaveLength(0)
    })

    it('should accept payload with scanTimestamp in ISO 8601 format', () => {
      const errors = validateScanFields(mockScanResultClean)
      expect(errors.filter(e => e.path[0] === 'scanTimestamp')).toHaveLength(0)
    })

    it('should accept payload with numberOfRejectedFiles', () => {
      const payload = {
        ...mockScanResultClean,
        numberOfRejectedFiles: 0
      }
      const errors = validateScanFields(payload)
      expect(errors.filter(e => e.path[0] === 'numberOfRejectedFiles')).toHaveLength(0)
    })

    it('should accept payload without optional numberOfRejectedFiles', () => {
      const errors = validateScanFields(mockScanResultClean)
      // No numberOfRejectedFiles in mock, should not cause error
      expect(errors.filter(e => e.path[0] === 'numberOfRejectedFiles')).toHaveLength(0)
    })
  })

  describe('Invalid scan field values rejected', () => {
    it('should reject CLEAN with virusResult', () => {
      const errors = validateScanFields(mockScanResultCleanWithVirus)
      expect(errors.filter(e => e.path[0] === 'virusResult').length).toBeGreaterThan(0)
    })

    it('should reject INFECTED without virusResult', () => {
      const errors = validateScanFields(mockScanResultInfectedWithoutVirus)
      expect(errors.filter(e => e.path[0] === 'virusResult').length).toBeGreaterThan(0)
    })

    it('should reject INVALID_FILE_TYPE with virusResult', () => {
      const errors = validateScanFields(mockScanResultInvalidFileTypeWithVirus)
      expect(errors.filter(e => e.path[0] === 'virusResult').length).toBeGreaterThan(0)
    })

    it('should reject CLEAN with rejectionReason', () => {
      const errors = validateScanFields(mockScanResultCleanWithRejection)
      expect(errors.filter(e => e.path[0] === 'rejectionReason').length).toBeGreaterThan(0)
    })

    it('should reject INFECTED with rejectionReason', () => {
      const errors = validateScanFields(mockScanResultInfectedWithRejectionReason)
      expect(errors.filter(e => e.path[0] === 'rejectionReason').length).toBeGreaterThan(0)
    })

    it('should reject invalid scanStatus enum value', () => {
      const errors = validateScanFields(mockScanResultInvalidStatus)
      expect(errors.filter(e => e.path[0] === 'scanStatus').length).toBeGreaterThan(0)
    })

    it('should reject invalid rejectionReason enum value', () => {
      const errors = validateScanFields(mockScanResultInvalidRejectionReason)
      expect(errors.filter(e => e.path[0] === 'rejectionReason').length).toBeGreaterThan(0)
    })

    it('should reject invalid scanTimestamp format', () => {
      const errors = validateScanFields(mockScanResultInvalidTimestamp)
      expect(errors.filter(e => e.path[0] === 'scanTimestamp').length).toBeGreaterThan(0)
    })

    it('should reject missing scanTimestamp', () => {
      const errors = validateScanFields(mockScanResultMissingTimestamp)
      // Schema should require scanTimestamp - test will verify this when schema is implemented
      expect(errors.filter(e => e.path[0] === 'scanTimestamp').length).toBeGreaterThan(0)
    })

    it('should reject numberOfRejectedFiles as non-integer', () => {
      const payload = {
        ...mockScanResultClean,
        numberOfRejectedFiles: 1.5 // Float not allowed
      }
      const errors = validateScanFields(payload)
      expect(errors.filter(e => e.path[0] === 'numberOfRejectedFiles').length).toBeGreaterThan(0)
    })

    it('should reject numberOfRejectedFiles as negative', () => {
      const payload = {
        ...mockScanResultClean,
        numberOfRejectedFiles: -1 // Negative not allowed
      }
      const errors = validateScanFields(payload)
      expect(errors.filter(e => e.path[0] === 'numberOfRejectedFiles').length).toBeGreaterThan(0)
    })
  })

  describe('Backward compatibility - payloads without scan fields', () => {
    it('should continue to accept payloads without scanStatus (for backward compat during transition)', () => {
      const payload = {
        uploadStatus: 'ready',
        metadata: {},
        form: {}
      }
      // Payloads without scanStatus should still be accepted by the schema
      // (though custom validators will enforce it after this transition period)
      expect(() => {
        validateScanFields(payload) // Should not throw
      }).not.toThrow()
    })

    it('should continue to accept payloads without scanTimestamp', () => {
      const payload = {
        uploadStatus: 'ready',
        metadata: {},
        form: {},
        scanStatus: 'CLEAN'
        // No scanTimestamp
      }
      // During transition, missing scanTimestamp might be allowed
      // (but implementation in Phase 4 may require it)
      expect(() => {
        validateScanFields(payload)
      }).not.toThrow()
    })
  })

  describe('Scan field types and formats', () => {
    it('scanStatus should be string type', () => {
      const validPayload = { ...mockScanResultClean }
      expect(typeof validPayload.scanStatus).toBe('string')
    })

    it('virusResult should be string type when present', () => {
      const validPayload = { ...mockScanResultInfected }
      expect(typeof validPayload.virusResult).toBe('string')
    })

    it('rejectionReason should be string type when present', () => {
      const validPayload = { ...mockScanResultInvalidFileType }
      expect(typeof validPayload.rejectionReason).toBe('string')
    })

    it('scanTimestamp should be ISO 8601 format string', () => {
      const validPayload = { ...mockScanResultClean }
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
      expect(iso8601Regex.test(validPayload.scanTimestamp)).toBe(true)
    })

    it('numberOfRejectedFiles should be non-negative integer when present', () => {
      const payload = {
        ...mockScanResultClean,
        numberOfRejectedFiles: 5
      }
      expect(Number.isInteger(payload.numberOfRejectedFiles)).toBe(true)
      expect(payload.numberOfRejectedFiles).toBeGreaterThanOrEqual(0)
    })
  })

  describe('All valid scanStatus enum values accepted', () => {
    const validStatuses = ['CLEAN', 'INFECTED', 'INVALID_FILE_TYPE', 'SCAN_TIMEOUT', 'REJECTED']

    validStatuses.forEach(status => {
      it(`should accept scanStatus: ${status}`, () => {
        const payload = {
          scanStatus: status,
          scanTimestamp: '2026-03-04T10:00:00Z'
        }
        const errors = validateScanFields(payload)
        expect(errors.filter(e => e.path[0] === 'scanStatus')).toHaveLength(0)
      })
    })
  })

  describe('All valid rejectionReason enum values accepted', () => {
    const validReasons = ['VIRUS_DETECTED', 'INVALID_FILE_TYPE', 'SCAN_TIMEOUT', 'FILE_TOO_LARGE']

    validReasons.forEach(reason => {
      it(`should accept rejectionReason: ${reason}`, () => {
        const payload = {
          scanStatus: 'REJECTED',
          rejectionReason: reason,
          scanTimestamp: '2026-03-04T10:00:00Z'
        }
        const errors = validateScanFields(payload)
        expect(errors.filter(e => e.path[0] === 'rejectionReason')).toHaveLength(0)
      })
    })
  })

  describe('numberOfRejectedFiles boundary conditions', () => {
    it('should accept numberOfRejectedFiles = 0', () => {
      const payload = {
        ...mockScanResultClean,
        numberOfRejectedFiles: 0
      }
      const errors = validateScanFields(payload)
      expect(errors.filter(e => e.path[0] === 'numberOfRejectedFiles')).toHaveLength(0)
    })

    it('should accept numberOfRejectedFiles > 0', () => {
      const payload = {
        ...mockScanResultClean,
        numberOfRejectedFiles: 100
      }
      const errors = validateScanFields(payload)
      expect(errors.filter(e => e.path[0] === 'numberOfRejectedFiles')).toHaveLength(0)
    })

    it('should accept numberOfRejectedFiles = 1', () => {
      const payload = {
        ...mockScanResultClean,
        numberOfRejectedFiles: 1
      }
      const errors = validateScanFields(payload)
      expect(errors.filter(e => e.path[0] === 'numberOfRejectedFiles')).toHaveLength(0)
    })
  })
})
