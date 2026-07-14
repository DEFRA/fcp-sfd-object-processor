import { validateFileUploadConsistency } from './validate-file-upload-consistency.js'
import { flattenFormFiles } from '../../../../utils/flatten-form-files.js'

/**
 * Validates all file uploads in the form data for semantic consistency.
 * Iterates form entries and runs contract validation on each file object.
 * Flattens arrays to validate grouped file uploads.
 *
 * @param {Object} form - The form object containing file uploads and text fields
 * @returns {{ isValid: boolean, error?: string, file?: Object }}
 */
export function validateFormFiles (form) {
  for (const fileVal of flattenFormFiles(form)) {
    const isFileUpload = fileVal && typeof fileVal === 'object' && 'fileId' in fileVal
    if (!isFileUpload) {
      continue
    }

    const check = validateFileUploadConsistency(fileVal)
    if (!check.isValid) {
      return { isValid: false, error: check.error, file: fileVal }
    }
  }

  return { isValid: true }
}
