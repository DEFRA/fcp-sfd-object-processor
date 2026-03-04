import {
  statusRequiresRejectionReason,
  statusForbidsRejectionReason,
  statusRequiresVirusResult,
  statusForbidsVirusResult,
  isValidRejectionReasonForStatus
} from '../../../constants/scan-results.js'

/**
 * Custom Validators for Scan Result Contract
 *
 * These validators are called AFTER Joi schema validation to enforce
 * additional business rules that are difficult to express in Joi syntax.
 *
 * Return format: { isValid: boolean, error?: string }
 */

/**
 * Validate that virusResult field aligns with scanStatus
 *
 * Rules:
 * - INFECTED must have virusResult
 * - All other statuses must NOT have virusResult
 *
 * @param {string} scanStatus - The scan status value
 * @param {string|undefined} virusResult - The virus result value
 * @returns {object} { isValid: boolean, error?: string }
 */
export const validateScanResultConsistency = (scanStatus, virusResult) => {
  if (statusRequiresVirusResult(scanStatus) && !virusResult) {
    return {
      isValid: false,
      error: `${scanStatus} requires virusResult field`
    }
  }

  if (statusForbidsVirusResult(scanStatus) && virusResult) {
    return {
      isValid: false,
      error: `${scanStatus} forbids virusResult field`
    }
  }

  return { isValid: true }
}

/**
 * Validate that rejectionReason aligns with scanStatus and has valid value
 *
 * Rules:
 * - INVALID_FILE_TYPE requires rejectionReason=INVALID_FILE_TYPE
 * - SCAN_TIMEOUT requires rejectionReason=SCAN_TIMEOUT
 * - REJECTED requires rejectionReason=(one of 4 valid values)
 * - CLEAN and INFECTED must NOT have rejectionReason
 *
 * @param {string} scanStatus - The scan status value
 * @param {string|undefined} rejectionReason - The rejection reason value
 * @returns {object} { isValid: boolean, error?: string }
 */
export const validateRejectionReasonAlignment = (scanStatus, rejectionReason) => {
  if (statusRequiresRejectionReason(scanStatus) && !rejectionReason) {
    return {
      isValid: false,
      error: `${scanStatus} requires rejectionReason field`
    }
  }

  if (statusForbidsRejectionReason(scanStatus) && rejectionReason) {
    return {
      isValid: false,
      error: `${scanStatus} forbids rejectionReason field`
    }
  }

  if (rejectionReason && !isValidRejectionReasonForStatus(scanStatus, rejectionReason)) {
    return {
      isValid: false,
      error: `${rejectionReason} is not valid for ${scanStatus}`
    }
  }

  return { isValid: true }
}

/**
 * Validate that numberOfRejectedFiles is consistent with scanStatus
 *
 * Rules:
 * - CLEAN status should have numberOfRejectedFiles=0
 * - REJECTED status should have numberOfRejectedFiles>0
 * - numberOfRejectedFiles should be <= total files in payload
 *
 * Note: This validator requires totalFileCount to be passed separately
 *
 * @param {string} scanStatus - The scan status value
 * @param {number|undefined} numberOfRejectedFiles - The rejected file count
 * @param {number|undefined} totalFileCount - Total files in payload (optional)
 * @returns {object} { isValid: boolean, error?: string }
 */
export const validateFileCountConsistency = (scanStatus, numberOfRejectedFiles, totalFileCount) => {
  // Only validate if numberOfRejectedFiles is provided
  if (numberOfRejectedFiles === undefined || numberOfRejectedFiles === null) {
    return { isValid: true }
  }

  // If totalFileCount is provided, verify numberOfRejectedFiles doesn't exceed it
  if (totalFileCount !== undefined && totalFileCount !== null && numberOfRejectedFiles > totalFileCount) {
    return {
      isValid: false,
      error: `numberOfRejectedFiles (${numberOfRejectedFiles}) cannot exceed total files (${totalFileCount})`
    }
  }

  return { isValid: true }
}
