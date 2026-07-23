/**
 * Normalises callback/status `form` fields into a map of single-value fields.
 *
 * Any array-valued field (grouped uploads) is re-keyed using a 1-based index:
 * { document: [f1, f2] } -> { 'document-1': f1, 'document-2': f2 }
 *
 * @param {object|null|undefined} form - The form object from payloads
 * @returns {object|null|undefined} Normalised form object, or original non-object input
 */
const normaliseFormFields = (form) => {
  if (!form || typeof form !== 'object') {
    return form
  }

  const result = {}

  for (const [key, value] of Object.entries(form)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        result[`${key}-${index + 1}`] = item
      })
    } else {
      result[key] = value
    }
  }

  return result
}

export { normaliseFormFields }
