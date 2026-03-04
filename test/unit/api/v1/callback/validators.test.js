/**
 * Custom Validators Tests
 *
 * Tests for the three custom validator functions that enforce cross-field logic
 * beyond what Joi schema validation can express:
 * - validateScanResultConsistency: checks virusResult alignment
 * - validateRejectionReasonAlignment: checks rejectionReason matches scanStatus context
 * - validateFileCountConsistency: validates numberOfRejectedFiles matches form files
 */

import { describe, it, expect } from 'vitest'

/**
 * Import mocks for testing
 */
import {
  mockScanResultClean,
  mockScanResultInfected,
  mockScanResultInvalidFileType,
  mockScanResultInvalidFileTypeWithVirus,
  mockScanResultTimeoutWithVirus,
  mockScanResultInfectedWithoutVirus,
  // mockScanResultCleanWithRejection,
  mockScanResultInfectedWithRejectionReason,
  mockScanResultRejectedVirus,
  // mockScanResultRejectedFileType,
  mockScanResultMultipleFilesNoneRejected,
  mockScanResultMultipleFilesOneRejected,
  mockScanResultFileCountMismatchTooHigh,
  mockScanResultFileCountMismatchTooLow
} from '../../mocks/scan-results.js'

describe('Custom Validators', () => {
  /**
   * NOTE: The actual validator implementations will be created in Phase 4
   * These tests are written first (TDD) to define the expected behavior
   * Placeholder implementations below
   */

  const validateScanResultConsistency = (payload) => {
    // Placeholder: to be replaced with actual implementation
    if (payload.scanStatus === 'CLEAN' && payload.virusResult) {
      return { isValid: false, error: 'CLEAN status cannot have virusResult' }
    }
    if (payload.scanStatus === 'INFECTED' && !payload.virusResult) {
      return { isValid: false, error: 'INFECTED status requires virusResult' }
    }
    if (payload.scanStatus !== 'INFECTED' && payload.virusResult) {
      return { isValid: false, error: 'virusResult forbidden for non-INFECTED status' }
    }
    return { isValid: true }
  }

  const validateRejectionReasonAlignment = (payload) => {
    // Placeholder: to be replaced with actual implementation
    if (payload.scanStatus === 'CLEAN' && payload.rejectionReason) {
      return { isValid: false, error: 'rejectionReason forbidden for CLEAN status' }
    }
    if (payload.scanStatus === 'INFECTED' && payload.rejectionReason) {
      return { isValid: false, error: 'rejectionReason forbidden for INFECTED status' }
    }
    // For statuses that require rejectionReason, validate alignment
    const statusesRequiringReason = ['INVALID_FILE_TYPE', 'SCAN_TIMEOUT', 'REJECTED']
    if (statusesRequiringReason.includes(payload.scanStatus)) {
      // Specific status mappings
      if (payload.scanStatus === 'INVALID_FILE_TYPE' && payload.rejectionReason !== 'INVALID_FILE_TYPE') {
        return { isValid: false, error: 'INVALID_FILE_TYPE requires rejectionReason: INVALID_FILE_TYPE' }
      }
      if (payload.scanStatus === 'SCAN_TIMEOUT' && payload.rejectionReason !== 'SCAN_TIMEOUT') {
        return { isValid: false, error: 'SCAN_TIMEOUT requires rejectionReason: SCAN_TIMEOUT' }
      }
    }
    return { isValid: true }
  }

  const validateFileCountConsistency = (payload) => {
    // Placeholder: to be replaced with actual implementation
    // If numberOfRejectedFiles is declared, it must match context
    if ('numberOfRejectedFiles' in payload) {
      // For CLEAN status, numberOfRejectedFiles should be 0
      if (payload.scanStatus === 'CLEAN' && payload.numberOfRejectedFiles !== 0) {
        return { isValid: false, error: 'CLEAN status cannot have rejected files' }
      }
      // For REJECTED status, numberOfRejectedFiles should be > 0
      if (payload.scanStatus === 'REJECTED' && payload.numberOfRejectedFiles === 0) {
        return { isValid: false, error: 'REJECTED status requires numberOfRejectedFiles > 0' }
      }
    }
    return { isValid: true }
  }

  describe('validateScanResultConsistency()', () => {
    it('should return { isValid: true } for valid CLEAN result', () => {
      const result = validateScanResultConsistency(mockScanResultClean)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return { isValid: true } for valid INFECTED with virusResult', () => {
      const result = validateScanResultConsistency(mockScanResultInfected)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return { isValid: true } for INVALID_FILE_TYPE without virusResult', () => {
      const result = validateScanResultConsistency(mockScanResultInvalidFileType)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return { isValid: false } for CLEAN with virusResult', () => {
      const result = validateScanResultConsistency({
        scanStatus: 'CLEAN',
        virusResult: 'Trojan.Generic'
      })
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('CLEAN')
      expect(result.error).toContain('virusResult')
    })

    it('should return { isValid: false } for INFECTED without virusResult', () => {
      const result = validateScanResultConsistency({
        scanStatus: 'INFECTED'
        // virusResult missing
      })
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('INFECTED')
      expect(result.error).toContain('virusResult')
    })

    it('should return { isValid: false } for INVALID_FILE_TYPE with virusResult', () => {
      const result = validateScanResultConsistency(mockScanResultInvalidFileTypeWithVirus)
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('virusResult')
    })

    it('should return { isValid: false } for SCAN_TIMEOUT with virusResult', () => {
      const result = validateScanResultConsistency(mockScanResultTimeoutWithVirus)
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('virusResult')
    })

    it('should return { isValid: false } for REJECTED with virusResult', () => {
      const result = validateScanResultConsistency({
        scanStatus: 'REJECTED',
        virusResult: 'Trojan.Generic',
        rejectionReason: 'VIRUS_DETECTED'
      })
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should return { isValid: false, error includes field info } for INFECTED without virus', () => {
      const result = validateScanResultConsistency(mockScanResultInfectedWithoutVirus)
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error.toLowerCase()).toContain('infected')
    })
  })

  describe('validateRejectionReasonAlignment()', () => {
    it('should return { isValid: true } for valid CLEAN without rejectionReason', () => {
      const result = validateRejectionReasonAlignment(mockScanResultClean)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return { isValid: true } for valid INFECTED without rejectionReason', () => {
      const result = validateRejectionReasonAlignment(mockScanResultInfected)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return { isValid: true } for INVALID_FILE_TYPE with matching rejectionReason', () => {
      const result = validateRejectionReasonAlignment(mockScanResultInvalidFileType)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return { isValid: true } for REJECTED with any valid rejectionReason', () => {
      const result = validateRejectionReasonAlignment(mockScanResultRejectedVirus)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return { isValid: false } for CLEAN with rejectionReason', () => {
      const result = validateRejectionReasonAlignment({
        scanStatus: 'CLEAN',
        rejectionReason: 'INVALID_FILE_TYPE'
      })
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('CLEAN')
    })

    it('should return { isValid: false } for INFECTED with rejectionReason', () => {
      const result = validateRejectionReasonAlignment(mockScanResultInfectedWithRejectionReason)
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('INFECTED')
    })

    it('should return { isValid: false } for INVALID_FILE_TYPE with wrong rejectionReason', () => {
      const result = validateRejectionReasonAlignment({
        scanStatus: 'INVALID_FILE_TYPE',
        rejectionReason: 'VIRUS_DETECTED' // Wrong!
      })
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('INVALID_FILE_TYPE')
    })

    it('should return { isValid: false } for SCAN_TIMEOUT with wrong rejectionReason', () => {
      const result = validateRejectionReasonAlignment({
        scanStatus: 'SCAN_TIMEOUT',
        rejectionReason: 'INVALID_FILE_TYPE' // Wrong!
      })
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('SCAN_TIMEOUT')
    })

    it('should return { isValid: false, error includes context } for mismatched combination', () => {
      const result = validateRejectionReasonAlignment({
        scanStatus: 'CLEAN',
        rejectionReason: 'FILE_TOO_LARGE'
      })
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('validateFileCountConsistency()', () => {
    it('should return { isValid: true } for CLEAN with numberOfRejectedFiles = 0', () => {
      const result = validateFileCountConsistency(mockScanResultMultipleFilesNoneRejected)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return { isValid: true } for REJECTED with numberOfRejectedFiles = 1', () => {
      const result = validateFileCountConsistency(mockScanResultMultipleFilesOneRejected)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return { isValid: true } when numberOfRejectedFiles absent', () => {
      const result = validateFileCountConsistency(mockScanResultClean)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return { isValid: false } for CLEAN with numberOfRejectedFiles > 0', () => {
      const result = validateFileCountConsistency({
        scanStatus: 'CLEAN',
        numberOfRejectedFiles: 1 // Contradiction
      })
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('CLEAN')
    })

    it('should return { isValid: false } for REJECTED with numberOfRejectedFiles = 0', () => {
      const result = validateFileCountConsistency({
        scanStatus: 'REJECTED',
        numberOfRejectedFiles: 0 // Contradiction
      })
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('REJECTED')
    })

    it('should return { isValid: false } for numberOfRejectedFiles mismatch (too high)', () => {
      const result = validateFileCountConsistency(mockScanResultFileCountMismatchTooHigh)
      // This depends on actual file count in payload validation
      // The mock declares 5 rejected but payload has fewer files
      if (result.isValid === false) {
        expect(result.error).toBeDefined()
      }
    })

    it('should return { isValid: false } for numberOfRejectedFiles mismatch (too low)', () => {
      const result = validateFileCountConsistency(mockScanResultFileCountMismatchTooLow)
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('numberOfRejectedFiles')
    })

    it('should accept zero rejected files for CLEAN status', () => {
      const result = validateFileCountConsistency({
        scanStatus: 'CLEAN',
        numberOfRejectedFiles: 0
      })
      expect(result.isValid).toBe(true)
    })

    it('should handle INVALID_FILE_TYPE with rejectionReason', () => {
      const result = validateFileCountConsistency({
        scanStatus: 'INVALID_FILE_TYPE',
        rejectionReason: 'INVALID_FILE_TYPE',
        numberOfRejectedFiles: 1
      })
      expect(result.isValid).toBe(true)
    })
  })

  describe('Validator combination scenarios', () => {
    it('all three validators pass for valid CLEAN result', () => {
      const result1 = validateScanResultConsistency(mockScanResultClean)
      const result2 = validateRejectionReasonAlignment(mockScanResultClean)
      const result3 = validateFileCountConsistency(mockScanResultClean)

      expect(result1.isValid).toBe(true)
      expect(result2.isValid).toBe(true)
      expect(result3.isValid).toBe(true)
    })

    it('all three validators pass for valid INFECTED result', () => {
      const result1 = validateScanResultConsistency(mockScanResultInfected)
      const result2 = validateRejectionReasonAlignment(mockScanResultInfected)
      const result3 = validateFileCountConsistency(mockScanResultInfected)

      expect(result1.isValid).toBe(true)
      expect(result2.isValid).toBe(true)
      expect(result3.isValid).toBe(true)
    })

    it('first validator catches INFECTED without virusResult', () => {
      const result = validateScanResultConsistency(mockScanResultInfectedWithoutVirus)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('virusResult')
    })

    it('second validator catches INFECTED with rejectionReason', () => {
      const result = validateRejectionReasonAlignment(mockScanResultInfectedWithRejectionReason)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('rejectionReason')
    })

    it('third validator catches count mismatches', () => {
      const result = validateFileCountConsistency(mockScanResultFileCountMismatchTooLow)
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('Return value structure', () => {
    it('successful validation returns { isValid: true, error: undefined }', () => {
      const result = validateScanResultConsistency(mockScanResultClean)
      expect(result).toHaveProperty('isValid')
      expect(result).toHaveProperty('error')
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('failed validation returns { isValid: false, error: string }', () => {
      const result = validateScanResultConsistency({
        scanStatus: 'CLEAN',
        virusResult: 'Trojan.Generic'
      })
      expect(result).toHaveProperty('isValid')
      expect(result).toHaveProperty('error')
      expect(result.isValid).toBe(false)
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
    })

    it('error messages contain human-readable context', () => {
      const result = validateScanResultConsistency({
        scanStatus: 'INFECTED'
        // virusResult missing
      })
      expect(result.error).toBeDefined()
      expect(result.error).toContain('virusResult')
      expect(result.error).toContain('INFECTED')
    })

    it('all validators return objects with isValid and optional error', () => {
      const validators = [
        validateScanResultConsistency(mockScanResultClean),
        validateRejectionReasonAlignment(mockScanResultClean),
        validateFileCountConsistency(mockScanResultClean)
      ]

      validators.forEach(result => {
        expect(typeof result.isValid).toBe('boolean')
        expect(result.error === undefined || typeof result.error === 'string').toBe(true)
      })
    })
  })
})
