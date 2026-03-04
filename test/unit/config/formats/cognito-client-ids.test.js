import { describe, test, expect } from 'vitest'
import { cognitoClientIdArray } from '../../../../src/config/formats/cognito-client-ids.js'

describe('cognitoClientIdArray format', () => {
  describe('validate function', () => {
    test('should return early for null value', () => {
      expect(() => cognitoClientIdArray.validate(null)).not.toThrow()
    })

    test('should return early for empty string', () => {
      expect(() => cognitoClientIdArray.validate('')).not.toThrow()
    })

    test('should validate empty array', () => {
      expect(() => cognitoClientIdArray.validate([])).not.toThrow()
    })

    test('should validate array with single valid client ID', () => {
      const validClientId = '1234567890abcdefghijklmnop'
      expect(() => cognitoClientIdArray.validate([validClientId])).not.toThrow()
    })

    test('should validate array with multiple valid client IDs', () => {
      const validClientIds = [
        '1234567890abcdefghijklmnop',
        'abcdefghijklmnop1234567890',
        'ABCDEFGHIJKLMNOP1234567890'
      ]
      expect(() => cognitoClientIdArray.validate(validClientIds)).not.toThrow()
    })

    test('should throw error for array with invalid characters', () => {
      const invalidClientId = 'invalid-client-id-with-dashes'
      expect(() => cognitoClientIdArray.validate([invalidClientId]))
        .toThrow('Must be a comma separated list of valid Cognito client IDs (alphanumeric)')
    })

    test('should throw error for array with special characters', () => {
      const invalidClientId = 'client@id#with'
      expect(() => cognitoClientIdArray.validate([invalidClientId]))
        .toThrow('Must be a comma separated list of valid Cognito client IDs (alphanumeric)')
    })

    test('should throw error for array with non-string element', () => {
      const nonString = 123
      expect(() => cognitoClientIdArray.validate([nonString]))
        .toThrow('Must be a comma separated list of valid Cognito client IDs (alphanumeric)')
    })

    test('should throw error for array with mixed valid and invalid IDs', () => {
      const mixedIds = [
        '1234567890abcdefghijklmnop',
        'invalid-id'
      ]
      expect(() => cognitoClientIdArray.validate(mixedIds))
        .toThrow('Must be a comma separated list of valid Cognito client IDs (alphanumeric)')
    })

    test('should validate single client ID string', () => {
      const validClientId = '1234567890abcdefghijklmnop'
      expect(() => cognitoClientIdArray.validate(validClientId)).not.toThrow()
    })

    test('should validate comma-separated client ID string', () => {
      const validClientIdString = '1234567890abcdefghijklmnop,abcdefghijklmnop1234567890'
      expect(() => cognitoClientIdArray.validate(validClientIdString)).not.toThrow()
    })

    test('should throw error for invalid single client ID string', () => {
      const invalidClientId = 'invalid-client-id'
      expect(() => cognitoClientIdArray.validate(invalidClientId))
        .toThrow('Must be a comma separated list of valid Cognito client IDs (alphanumeric)')
    })

    test('should throw error for comma-separated string with invalid ID', () => {
      const invalidClientIdString = '1234567890abcdefghijklmnop,invalid-id'
      expect(() => cognitoClientIdArray.validate(invalidClientIdString))
        .toThrow('Must be a comma separated list of valid Cognito client IDs (alphanumeric)')
    })

    test('should throw error for string with spaces', () => {
      const withSpaces = '1234567890abcdefghijklmnop, abcdefghijklmnop1234567890'
      expect(() => cognitoClientIdArray.validate(withSpaces))
        .toThrow('Must be a comma separated list of valid Cognito client IDs (alphanumeric)')
    })

    test('should throw error for string starting with comma', () => {
      const startingComma = ',1234567890abcdefghijklmnop'
      expect(() => cognitoClientIdArray.validate(startingComma))
        .toThrow('Must be a comma separated list of valid Cognito client IDs (alphanumeric)')
    })

    test('should throw error for string ending with comma', () => {
      const endingComma = '1234567890abcdefghijklmnop,'
      expect(() => cognitoClientIdArray.validate(endingComma))
        .toThrow('Must be a comma separated list of valid Cognito client IDs (alphanumeric)')
    })

    test('should validate client IDs with uppercase letters', () => {
      const uppercaseId = 'ABCDEFGHIJKLMNOP1234567890'
      expect(() => cognitoClientIdArray.validate(uppercaseId)).not.toThrow()
    })

    test('should validate client IDs with mixed case letters', () => {
      const mixedCaseId = 'AbCdEfGhIjKlMnOp1234567890'
      expect(() => cognitoClientIdArray.validate(mixedCaseId)).not.toThrow()
    })

    test('should validate purely numeric client IDs', () => {
      const numericId = '12345678901234567890123456'
      expect(() => cognitoClientIdArray.validate(numericId)).not.toThrow()
    })

    test('should validate purely alphabetic client IDs', () => {
      const alphabeticId = 'abcdefghijklmnopqrstuvwxyz'
      expect(() => cognitoClientIdArray.validate(alphabeticId)).not.toThrow()
    })
  })

  describe('coerce function', () => {
    test('should return array as-is when input is array', () => {
      const inputArray = ['1234567890abcdefghijklmnop']
      const result = cognitoClientIdArray.coerce(inputArray)
      expect(result).toBe(inputArray)
      expect(result).toEqual(['1234567890abcdefghijklmnop'])
    })

    test('should return empty array when input is null', () => {
      const result = cognitoClientIdArray.coerce(null)
      expect(result).toEqual([])
    })

    test('should return empty array when input is empty string', () => {
      const result = cognitoClientIdArray.coerce('')
      expect(result).toEqual([])
    })

    test('should split single client ID string into array', () => {
      const singleId = '1234567890abcdefghijklmnop'
      const result = cognitoClientIdArray.coerce(singleId)
      expect(result).toEqual(['1234567890abcdefghijklmnop'])
    })

    test('should split comma-separated client ID string into array', () => {
      const multipleIds = '1234567890abcdefghijklmnop,abcdefghijklmnop1234567890'
      const result = cognitoClientIdArray.coerce(multipleIds)
      expect(result).toEqual([
        '1234567890abcdefghijklmnop',
        'abcdefghijklmnop1234567890'
      ])
    })

    test('should handle string with many comma-separated values', () => {
      const manyIds = 'clientid1,clientid2,clientid3'
      const result = cognitoClientIdArray.coerce(manyIds)
      expect(result).toEqual([
        'clientid1',
        'clientid2',
        'clientid3'
      ])
    })

    test('should handle empty array input', () => {
      const emptyArray = []
      const result = cognitoClientIdArray.coerce(emptyArray)
      expect(result).toBe(emptyArray)
      expect(result).toEqual([])
    })
  })

  describe('format properties', () => {
    test('should have correct name', () => {
      expect(cognitoClientIdArray.name).toBe('cognito-client-id-array')
    })

    test('should have validate function', () => {
      expect(typeof cognitoClientIdArray.validate).toBe('function')
    })

    test('should have coerce function', () => {
      expect(typeof cognitoClientIdArray.coerce).toBe('function')
    })
  })
})
