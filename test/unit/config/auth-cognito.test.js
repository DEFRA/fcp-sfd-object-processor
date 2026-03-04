import { describe, test, expect } from 'vitest'
import { authConfig } from '../../../src/config/auth.js'

describe('authConfig - Cognito', () => {
  test('should have auth.cognito.enabled field', () => {
    expect(authConfig.auth.cognito.enabled).toBeDefined()
    expect(authConfig.auth.cognito.enabled.doc).toBe('AWS Cognito authentication enabled')
    expect(authConfig.auth.cognito.enabled.format).toBe(Boolean)
    expect(authConfig.auth.cognito.enabled.default).toBe(false)
    expect(authConfig.auth.cognito.enabled.env).toBe('AUTH_COGNITO_ENABLED')
  })

  test('should have auth.cognito.tokenUrl field', () => {
    expect(authConfig.auth.cognito.tokenUrl).toBeDefined()
    expect(authConfig.auth.cognito.tokenUrl.doc).toBe('AWS Cognito OAuth2 token endpoint URL')
    expect(authConfig.auth.cognito.tokenUrl.format).toBe(String)
    expect(authConfig.auth.cognito.tokenUrl.nullable).toBe(true)
    expect(authConfig.auth.cognito.tokenUrl.default).toBe(null)
    expect(authConfig.auth.cognito.tokenUrl.env).toBe('AUTH_COGNITO_TOKEN_URL')
  })

  test('should have auth.cognito.userPoolId field', () => {
    expect(authConfig.auth.cognito.userPoolId).toBeDefined()
    expect(authConfig.auth.cognito.userPoolId.doc).toBe('AWS Cognito User Pool identifier')
    expect(authConfig.auth.cognito.userPoolId.format).toBe(String)
    expect(authConfig.auth.cognito.userPoolId.nullable).toBe(true)
    expect(authConfig.auth.cognito.userPoolId.default).toBe(null)
    expect(authConfig.auth.cognito.userPoolId.env).toBe('AUTH_COGNITO_USER_POOL_ID')
  })

  test('should have auth.cognito.clientIds field', () => {
    expect(authConfig.auth.cognito.clientIds).toBeDefined()
    expect(authConfig.auth.cognito.clientIds.doc).toBe('Authorized Cognito app client IDs, comma separated')
    expect(authConfig.auth.cognito.clientIds.format).toBe('cognito-client-id-array')
    expect(authConfig.auth.cognito.clientIds.default).toEqual([])
    expect(authConfig.auth.cognito.clientIds.nullable).toBe(false)
    expect(authConfig.auth.cognito.clientIds.env).toBe('AUTH_COGNITO_CLIENT_IDS')
  })

  test('should have all Cognito required fields', () => {
    expect(authConfig.auth.cognito).toBeDefined()
    const requiredFields = ['enabled', 'tokenUrl', 'userPoolId', 'clientIds']
    requiredFields.forEach(field => {
      expect(authConfig.auth.cognito[field]).toBeDefined()
    })
  })

  test('should maintain existing Entra fields', () => {
    expect(authConfig.auth.enabled).toBeDefined()
    expect(authConfig.auth.tenant).toBeDefined()
    expect(authConfig.auth.allowedGroupIds).toBeDefined()
  })
})
