import { validateFileUploadConsistency } from './validate-file-upload-consistency.js'

/**
 * Validates all file uploads in the form data for semantic consistency.
 * Iterates form entries and runs contract validation on each file object.
 *
 * @param {Object} form - The form object containing file uploads and text fields
 * @returns {{ isValid: boolean, error?: string, file?: Object }}
 */
export function validateFormFiles (form) {
  if (!form || typeof form !== 'object') {
    return { isValid: true }
  }

  for (const [, val] of Object.entries(form)) {
    const isFileUpload = val && typeof val === 'object' && 'fileId' in val
    if (!isFileUpload) {
      continue
    }

    const check = validateFileUploadConsistency(val)
    if (!check.isValid) {
      return { isValid: false, error: check.error, file: val }
    }
  }

  return { isValid: true }
}
