/**
 * Reusable mock validation errors and payloads for testing status mappers
 */

// Common validation error - single required field
export const mockRequiredFieldError = {
  details: [
    {
      path: ['metadata', 'crn'],
      type: 'any.required',
      context: { value: undefined }
    }
  ]
}

// Multiple validation errors
export const mockMultipleErrors = {
  details: [
    {
      path: ['metadata', 'crn'],
      type: 'any.required',
      context: { value: undefined }
    },
    {
      path: ['metadata', 'sbi'],
      type: 'number.min',
      context: { value: 123 }
    },
    {
      path: ['form', 'fileId'],
      type: 'string.guid',
      context: { value: 'not-a-uuid' }
    }
  ]
}

// Payload with two valid file uploads
export const mockPayloadWithFiles = {
  metadata: { sbi: 105000000 },
  form: {
    'file-1': { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' },
    'file-2': { fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554' }
  }
}

// Payload with no file uploads
export const mockPayloadNoFiles = {
  metadata: { sbi: 105000000 },
  form: { 'text-field': 'some text value' }
}

// Validated documents for buildValidatedStatusDocuments tests
export const mockValidatedDocuments = [
  {
    metadata: { sbi: 105000000 },
    file: { fileId: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13' }
  },
  {
    metadata: { sbi: 205000000 },
    file: { fileId: '3f90b889-eac7-4e98-975f-93fcef5b8554' }
  }
]
