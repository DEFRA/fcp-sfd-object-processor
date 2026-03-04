/**
 * Mock data for scan result variants
 *
 * Provides comprehensive mock data covering all valid and invalid scan result
 * combinations for use across unit and integration tests.
 *
 * These extend the base CDP Uploader mock response with scan result fields
 * that are added by the callback endpoint handler.
 */

import { mockScanAndUploadResponse, mockScanAndUploadResponseSingleFile } from './cdp-uploader.js'
import { SCAN_STATUSES, REJECTION_REASONS } from '../../../src/constants/scan-results.js'

/**
 * Valid scan result combinations
 */

/**
 * CLEAN scan result - file passed all checks
 * scanStatus: CLEAN
 * virusResult: absent
 * rejectionReason: absent
 */
export const mockScanResultClean = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.CLEAN,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * INFECTED scan result - virus detected in file
 * scanStatus: INFECTED
 * virusResult: required
 * rejectionReason: absent
 */
export const mockScanResultInfected = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.INFECTED,
  virusResult: 'Trojan.Generic',
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * INFECTED scan result - virus detected (alternative virus)
 */
export const mockScanResultInfectedRansom = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.INFECTED,
  virusResult: 'Ransom.Win32.Cerber',
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * INVALID_FILE_TYPE scan result - file type not allowed
 * scanStatus: INVALID_FILE_TYPE
 * virusResult: absent
 * rejectionReason: required (INVALID_FILE_TYPE)
 */
export const mockScanResultInvalidFileType = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.INVALID_FILE_TYPE,
  rejectionReason: REJECTION_REASONS.INVALID_FILE_TYPE,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * SCAN_TIMEOUT scan result - scan exceeded timeout
 * scanStatus: SCAN_TIMEOUT
 * virusResult: absent
 * rejectionReason: required (SCAN_TIMEOUT)
 */
export const mockScanResultTimeout = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.SCAN_TIMEOUT,
  rejectionReason: REJECTION_REASONS.SCAN_TIMEOUT,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * REJECTED scan result - general rejection with FILE_TOO_LARGE reason
 * scanStatus: REJECTED
 * virusResult: absent
 * rejectionReason: required (FILE_TOO_LARGE)
 */
export const mockScanResultRejectedFileTooLarge = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.REJECTED,
  rejectionReason: REJECTION_REASONS.FILE_TOO_LARGE,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * REJECTED scan result - general rejection with VIRUS_DETECTED reason
 */
export const mockScanResultRejectedVirus = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.REJECTED,
  rejectionReason: REJECTION_REASONS.VIRUS_DETECTED,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * REJECTED scan result - general rejection with INVALID_FILE_TYPE reason
 */
export const mockScanResultRejectedFileType = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.REJECTED,
  rejectionReason: REJECTION_REASONS.INVALID_FILE_TYPE,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * REJECTED scan result - general rejection with SCAN_TIMEOUT reason
 */
export const mockScanResultRejectedTimeout = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.REJECTED,
  rejectionReason: REJECTION_REASONS.SCAN_TIMEOUT,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * Invalid scan result combinations
 * These should fail schema or custom validator validation
 */

/**
 * CLEAN with virusResult - INVALID
 * virusResult should be forbidden when scanStatus is CLEAN
 */
export const mockScanResultCleanWithVirus = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.CLEAN,
  virusResult: 'Trojan.Generic',
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * INFECTED without virusResult - INVALID
 * virusResult is required when scanStatus is INFECTED
 */
export const mockScanResultInfectedWithoutVirus = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.INFECTED,
  // virusResult missing
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * INVALID_FILE_TYPE with virusResult - INVALID
 * virusResult should be forbidden when scanStatus is INVALID_FILE_TYPE
 */
export const mockScanResultInvalidFileTypeWithVirus = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.INVALID_FILE_TYPE,
  virusResult: 'Trojan.Generic',
  rejectionReason: REJECTION_REASONS.INVALID_FILE_TYPE,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * SCAN_TIMEOUT with virusResult - INVALID
 * virusResult should be forbidden when scanStatus is SCAN_TIMEOUT
 */
export const mockScanResultTimeoutWithVirus = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.SCAN_TIMEOUT,
  virusResult: 'Some.Virus',
  rejectionReason: REJECTION_REASONS.SCAN_TIMEOUT,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * CLEAN with rejectionReason - INVALID
 * rejectionReason should be forbidden when scanStatus is CLEAN
 */
export const mockScanResultCleanWithRejection = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.CLEAN,
  rejectionReason: REJECTION_REASONS.INVALID_FILE_TYPE,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * INFECTED with rejectionReason - INVALID
 * rejectionReason should be forbidden when scanStatus is INFECTED
 */
export const mockScanResultInfectedWithRejectionReason = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.INFECTED,
  virusResult: 'Trojan.Generic',
  rejectionReason: REJECTION_REASONS.VIRUS_DETECTED,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * Invalid rejectionReason value for INVALID_FILE_TYPE
 * INVALID_FILE_TYPE requires rejectionReason: INVALID_FILE_TYPE (not VIRUS_DETECTED)
 */
export const mockScanResultInvalidFileTypeWithWrongReason = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.INVALID_FILE_TYPE,
  rejectionReason: REJECTION_REASONS.VIRUS_DETECTED,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * Invalid rejectionReason value for SCAN_TIMEOUT
 * SCAN_TIMEOUT requires rejectionReason: SCAN_TIMEOUT (not INVALID_FILE_TYPE)
 */
export const mockScanResultTimeoutWithWrongReason = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.SCAN_TIMEOUT,
  rejectionReason: REJECTION_REASONS.INVALID_FILE_TYPE,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * INFECTED with wrong rejectionReason
 * INFECTED scanStatus should not have rejectionReason (should be forbidden)
 */
export const mockScanResultInfectedWithWrongReason = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.INFECTED,
  virusResult: 'Trojan.Generic',
  rejectionReason: REJECTION_REASONS.INVALID_FILE_TYPE, // Should be forbidden
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * Missing scanTimestamp - INVALID
 * scanTimestamp is required
 */
export const mockScanResultMissingTimestamp = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.CLEAN
  // scanTimestamp missing
}

/**
 * Invalid scanTimestamp format - INVALID
 * Must be valid ISO 8601 date string
 */
export const mockScanResultInvalidTimestamp = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.CLEAN,
  scanTimestamp: 'not-a-valid-date'
}

/**
 * Invalid scanStatus enum value
 */
export const mockScanResultInvalidStatus = {
  ...mockScanAndUploadResponse,
  scanStatus: 'UNKNOWN_STATUS',
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * Invalid rejectionReason enum value
 */
export const mockScanResultInvalidRejectionReason = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.REJECTED,
  rejectionReason: 'UNKNOWN_REASON',
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * File count variations for validateFileCountConsistency tests
 */

/**
 * Multiple files with numberOfRejectedFiles = 0
 * Valid when all files are clean
 */
export const mockScanResultMultipleFilesNoneRejected = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.CLEAN,
  numberOfRejectedFiles: 0,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * Multiple files with numberOfRejectedFiles = 1
 * Valid when exactly 1 file is rejected
 */
export const mockScanResultMultipleFilesOneRejected = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.REJECTED,
  rejectionReason: REJECTION_REASONS.INVALID_FILE_TYPE,
  numberOfRejectedFiles: 1,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * Multiple files with numberOfRejectedFiles = 3
 * Valid when exactly 3 files are rejected
 */
export const mockScanResultMultipleFilesThreeRejected = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.REJECTED,
  rejectionReason: REJECTION_REASONS.INVALID_FILE_TYPE,
  numberOfRejectedFiles: 3,
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * numberOfRejectedFiles = 5 but only 2 files in payload - INVALID
 * Mismatch between declared count and actual files
 */
export const mockScanResultFileCountMismatchTooHigh = {
  ...mockScanAndUploadResponseSingleFile, // Only 1 file
  scanStatus: SCAN_STATUSES.REJECTED,
  rejectionReason: REJECTION_REASONS.INVALID_FILE_TYPE,
  numberOfRejectedFiles: 5, // More than actual files
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * numberOfRejectedFiles = 0 but payload represents rejected files - INVALID
 * File count consistency violation
 */
export const mockScanResultFileCountMismatchTooLow = {
  ...mockScanAndUploadResponse,
  scanStatus: SCAN_STATUSES.REJECTED,
  rejectionReason: REJECTION_REASONS.INVALID_FILE_TYPE,
  numberOfRejectedFiles: 0, // Claims no files rejected but status is REJECTED
  scanTimestamp: '2026-03-04T10:00:00Z'
}

/**
 * Exported array for iteration in tests
 */
export const allValidScanResults = [
  mockScanResultClean,
  mockScanResultInfected,
  mockScanResultInfectedRansom,
  mockScanResultInvalidFileType,
  mockScanResultTimeout,
  mockScanResultRejectedFileTooLarge,
  mockScanResultRejectedVirus,
  mockScanResultRejectedFileType,
  mockScanResultRejectedTimeout
]

export const allInvalidScanResults = [
  mockScanResultCleanWithVirus,
  mockScanResultInfectedWithoutVirus,
  mockScanResultInvalidFileTypeWithVirus,
  mockScanResultTimeoutWithVirus,
  mockScanResultCleanWithRejection,
  mockScanResultInfectedWithRejectionReason,
  mockScanResultInvalidFileTypeWithWrongReason,
  mockScanResultTimeoutWithWrongReason,
  mockScanResultInfectedWithWrongReason,
  mockScanResultMissingTimestamp,
  mockScanResultInvalidTimestamp,
  mockScanResultInvalidStatus,
  mockScanResultInvalidRejectionReason,
  mockScanResultFileCountMismatchTooHigh,
  mockScanResultFileCountMismatchTooLow
]
