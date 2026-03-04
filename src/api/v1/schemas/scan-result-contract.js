import Joi from 'joi'
import {
  SCAN_STATUSES,
  REJECTION_REASONS
} from '../../../constants/scan-results.js'

/**
 * Scan Result Contract Schema
 *
 * Validates scan results with strict cross-field rules:
 * - CLEAN: must not have virusResult or rejectionReason
 * - INFECTED: must have virusResult, must not have rejectionReason
 * - INVALID_FILE_TYPE: must have rejectionReason=INVALID_FILE_TYPE, must not have virusResult
 * - SCAN_TIMEOUT: must have rejectionReason=SCAN_TIMEOUT, must not have virusResult
 * - REJECTED: must have rejectionReason (one of 4 reasons), must not have virusResult
 *
 * Uses Joi `.when()` for conditional field validation
 */

const scanStatusValues = Object.values(SCAN_STATUSES)
const rejectionReasonValues = Object.values(REJECTION_REASONS)

export const scanResultContractSchema = Joi.object({
  scanStatus: Joi.string()
    .valid(...scanStatusValues)
    .required()
    .description('File scan result status')
    .messages({
      'any.only': `scanStatus must be one of [${scanStatusValues.join(', ')}]`,
      'any.required': 'scanStatus is required'
    }),

  virusResult: Joi.string()
    .optional()
    .description('Name/type of virus detected (only when scanStatus is INFECTED)')
    .messages({
      'string.base': 'virusResult must be a string'
    })
    .when('scanStatus', {
      is: SCAN_STATUSES.INFECTED,
      then: Joi.string().required().messages({
        'any.required': 'INFECTED scanStatus requires virusResult field'
      }),
      otherwise: Joi.forbidden().messages({
        'any.forbidden': `${SCAN_STATUSES.INFECTED} is the only scanStatus that allows virusResult field`
      })
    }),

  rejectionReason: Joi.string()
    .valid(...rejectionReasonValues)
    .optional()
    .description('Reason for file rejection (required for certain statuses)')
    .messages({
      'any.only': `rejectionReason must be one of [${rejectionReasonValues.join(', ')}]`,
      'string.base': 'rejectionReason must be a string'
    })
    .when('scanStatus', {
      is: Joi.alternatives().try(
        Joi.string().valid(SCAN_STATUSES.INVALID_FILE_TYPE),
        Joi.string().valid(SCAN_STATUSES.SCAN_TIMEOUT),
        Joi.string().valid(SCAN_STATUSES.REJECTED)
      ),
      then: Joi.string().required().valid(...rejectionReasonValues).messages({
        'any.required': `${SCAN_STATUSES.INVALID_FILE_TYPE}, ${SCAN_STATUSES.SCAN_TIMEOUT}, and ${SCAN_STATUSES.REJECTED} scanStatuses require rejectionReason field`,
        'any.only': `rejectionReason must be one of [${rejectionReasonValues.join(', ')}]`
      }),
      otherwise: Joi.forbidden().messages({
        'any.forbidden': 'rejectionReason is not allowed for this scanStatus'
      })
    }),

  numberOfRejectedFiles: Joi.number()
    .integer()
    .min(0)
    .optional()
    .description('Count of files rejected during scanning')
    .messages({
      'number.base': 'numberOfRejectedFiles must be a number',
      'number.integer': 'numberOfRejectedFiles must be an integer',
      'number.min': 'numberOfRejectedFiles must be non-negative'
    }),

  scanTimestamp: Joi.string()
    .isoDate()
    .required()
    .description('ISO 8601 timestamp of when the scan completed')
    .messages({
      'string.isoDate': 'scanTimestamp must be a valid ISO 8601 date string',
      'any.required': 'scanTimestamp is required'
    })
}).strict()
  .description('File scan result contract with cross-field validation')
  .label('ScanResultContract')
