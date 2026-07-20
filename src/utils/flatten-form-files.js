/**
 * Flattens callback `form` field values into a single array.
 *
 * Expands any array-valued fields (grouped uploads) in-place; scalar values
 * (including text fields) are returned as-is.
 *
 * @param {object|null|undefined} form - The form object from the callback payload
 * @returns {Array<unknown>} Flat array of all form values (arrays expanded in-place)
 */
const flattenFormFiles = (form) => {
  if (!form || typeof form !== 'object') {
    return []
  }

  return Object.values(form).flatMap(val => Array.isArray(val) ? val : [val])
}

export { flattenFormFiles }
