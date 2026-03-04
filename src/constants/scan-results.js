/**
 * Scan Result Constants
 *
 * Canonical definitions for scan statuses and rejection reasons used across:
 * - Callback validation schema
 * - Custom validators
 * - Proxy endpoints (status, initiate)
 * - Test mocks and fixtures
 *
 * These constants ensure consistent enum values throughout the application
 * and serve as the single source of truth for valid scan result combinations.
 */

/**
 * Scan Status Enum
 *
 * Represents the outcome of a file scan operation:
 * - CLEAN: File passed all checks, safe to process
 * - INFECTED: Virus or malware detected in file
 * - INVALID_FILE_TYPE: File type not allowed by policy
 * - SCAN_TIMEOUT: Scan exceeded maximum time limit
 * - REJECTED: Generic rejection status (see rejectionReason for details)
 */
export const SCAN_STATUSES = {
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  SCAN_TIMEOUT: 'SCAN_TIMEOUT',
  REJECTED: 'REJECTED'
}

/**
 * Rejection Reason Enum
 *
 * Explains why a file was rejected or why scanning failed:
 * - VIRUS_DETECTED: Antivirus scan found malware/virus
 * - INVALID_FILE_TYPE: File extension or content type not allowed
 * - SCAN_TIMEOUT: Antivirus scanner did not complete within time limit
 * - FILE_TOO_LARGE: File size exceeds maximum allowed limit
 */
export const REJECTION_REASONS = {
  VIRUS_DETECTED: 'VIRUS_DETECTED',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  SCAN_TIMEOUT: 'SCAN_TIMEOUT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE'
}

/**
 * Scan Status Groups
 *
 * Logical groupings of statuses for conditional validation rules
 */
export const SCAN_STATUS_GROUPS = {
  // Statuses that require a rejectionReason field
  REQUIRES_REJECTION_REASON: [
    SCAN_STATUSES.INVALID_FILE_TYPE,
    SCAN_STATUSES.SCAN_TIMEOUT,
    SCAN_STATUSES.REJECTED
  ],
  // Statuses that forbid rejectionReason field
  FORBIDS_REJECTION_REASON: [
    SCAN_STATUSES.CLEAN,
    SCAN_STATUSES.INFECTED
  ],
  // Statuses that require virusResult field
  REQUIRES_VIRUS_RESULT: [
    SCAN_STATUSES.INFECTED
  ],
  // Statuses that forbid virusResult field
  FORBIDS_VIRUS_RESULT: [
    SCAN_STATUSES.CLEAN,
    SCAN_STATUSES.INVALID_FILE_TYPE,
    SCAN_STATUSES.SCAN_TIMEOUT,
    SCAN_STATUSES.REJECTED
  ]
}

/**
 * Status to Rejection Reason Mapping
 *
 * Defines which rejection reasons are valid for each rejection-requiring status.
 * Used for strict validation to prevent invalid combinations.
 */
export const STATUS_TO_REJECTION_REASON_MAPPING = {
  [SCAN_STATUSES.INVALID_FILE_TYPE]: [REJECTION_REASONS.INVALID_FILE_TYPE],
  [SCAN_STATUSES.SCAN_TIMEOUT]: [REJECTION_REASONS.SCAN_TIMEOUT],
  [SCAN_STATUSES.REJECTED]: [
    REJECTION_REASONS.VIRUS_DETECTED,
    REJECTION_REASONS.INVALID_FILE_TYPE,
    REJECTION_REASONS.SCAN_TIMEOUT,
    REJECTION_REASONS.FILE_TOO_LARGE
  ]
}

/**
 * Get all valid scan status values
 */
export const getValidScanStatusValues = () => Object.values(SCAN_STATUSES)

/**
 * Get all valid rejection reason values
 */
export const getValidRejectionReasonValues = () => Object.values(REJECTION_REASONS)

/**
 * Check if a status requires rejectionReason field
 *
 * @param {string} scanStatus - The scan status to check
 * @returns {boolean} True if rejectionReason is required
 */
export const statusRequiresRejectionReason = (scanStatus) =>
  SCAN_STATUS_GROUPS.REQUIRES_REJECTION_REASON.includes(scanStatus)

/**
 * Check if a status forbids rejectionReason field
 *
 * @param {string} scanStatus - The scan status to check
 * @returns {boolean} True if rejectionReason is forbidden
 */
export const statusForbidsRejectionReason = (scanStatus) =>
  SCAN_STATUS_GROUPS.FORBIDS_REJECTION_REASON.includes(scanStatus)

/**
 * Check if a status requires virusResult field
 *
 * @param {string} scanStatus - The scan status to check
 * @returns {boolean} True if virusResult is required
 */
export const statusRequiresVirusResult = (scanStatus) =>
  SCAN_STATUS_GROUPS.REQUIRES_VIRUS_RESULT.includes(scanStatus)

/**
 * Check if a status forbids virusResult field
 *
 * @param {string} scanStatus - The scan status to check
 * @returns {boolean} True if virusResult is forbidden
 */
export const statusForbidsVirusResult = (scanStatus) =>
  SCAN_STATUS_GROUPS.FORBIDS_VIRUS_RESULT.includes(scanStatus)

/**
 * Check if a rejection reason is valid for a given scan status
 *
 * @param {string} scanStatus - The scan status
 * @param {string} rejectionReason - The rejection reason to validate
 * @returns {boolean} True if the combination is valid
 */
export const isValidRejectionReasonForStatus = (scanStatus, rejectionReason) => {
  const validReasons = STATUS_TO_REJECTION_REASON_MAPPING[scanStatus]
  return validReasons ? validReasons.includes(rejectionReason) : false
}

/**
 * Check if a scan status value is invalid
 *
 * @param {string} scanStatus - The scan status to validate
 * @returns {boolean} True if the status is not in the valid enum
 */
export const isInvalidScanStatus = (scanStatus) =>
  !getValidScanStatusValues().includes(scanStatus)

/**
 * Check if a rejection reason value is invalid
 *
 * @param {string} rejectionReason - The rejection reason to validate
 * @returns {boolean} True if the reason is not in the valid enum
 */
export const isInvalidRejectionReason = (rejectionReason) =>
  !getValidRejectionReasonValues().includes(rejectionReason)

/**
 * Validate scan result contract conformance
 *
 * Comprehensive validation that checks if a payload conforms to the
 * scan result contract (useful for quick validation before persistence)
 *
 * @param {object} payload - The scan result payload to validate
 * @returns {object} { isValid: boolean, errors: string[] }
 */
export const validateScanResultContract = (payload) => {
  const errors = []

  // Check scanStatus is valid
  if (isInvalidScanStatus(payload.scanStatus)) {
    errors.push(`Invalid scanStatus: ${payload.scanStatus}`)
  }

  // Check virusResult alignment
  if (statusRequiresVirusResult(payload.scanStatus) && !payload.virusResult) {
    errors.push(`${payload.scanStatus} requires virusResult field`)
  }
  if (statusForbidsVirusResult(payload.scanStatus) && payload.virusResult) {
    errors.push(`${payload.scanStatus} forbids virusResult field`)
  }

  // Check rejectionReason alignment
  if (statusRequiresRejectionReason(payload.scanStatus) && !payload.rejectionReason) {
    errors.push(`${payload.scanStatus} requires rejectionReason field`)
  }
  if (statusForbidsRejectionReason(payload.scanStatus) && payload.rejectionReason) {
    errors.push(`${payload.scanStatus} forbids rejectionReason field`)
  }

  // Check rejectionReason value is valid for status
  if (payload.rejectionReason && isInvalidRejectionReason(payload.rejectionReason)) {
    errors.push(
      `${payload.rejectionReason} is not valid; valid reasons for ${payload.scanStatus}: ${STATUS_TO_REJECTION_REASON_MAPPING[payload.scanStatus]?.join(', ')}`
    )
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}
