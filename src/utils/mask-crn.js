/**
 * Masks a CRN while retaining its last four characters.
 * @param {string|number} crn
 * @returns {string}
 */
export const maskCrn = (crn) => {
  const value = String(crn)
  if (value.length <= 4) {
    return value
  }

  const maskedLength = value.length - 4

  return '*'.repeat(maskedLength) + value.slice(maskedLength)
}

/**
 * Replaces a CRN in log text with its masked form.
 * @param {string|undefined} text
 * @param {string|number|null|undefined} crn
 * @returns {string|undefined}
 */
export const maskCrnInText = (text, crn) => {
  if (typeof text !== 'string' || crn === undefined || crn === null || crn === '') {
    return text
  }

  return text.replaceAll(String(crn), maskCrn(crn))
}
