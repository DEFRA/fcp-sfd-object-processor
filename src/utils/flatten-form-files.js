/**
 * Flattens form values into a single array of file-upload candidates.
 * Form fields may be a single file object or an array of file objects
 * (grouped uploads). This normalises both shapes so callers can iterate
 * a flat list without needing to handle the two cases inline.
 *
 * @param {Object} form - The form object from the callback payload
 * @returns {Array} Flat array of all form values (arrays expanded in-place)
 */
const flattenFormFiles = (form) => {
  if (!form || typeof form !== 'object') {
    return []
  }

  return Object.values(form).flatMap(val => Array.isArray(val) ? val : [val])
}

export { flattenFormFiles }
