import { describe, expect, test } from 'vitest'
import { buildAuthDisabledLog, buildAuthConfigurationFailureLog } from '../../../src/utils/build-auth-configuration-log.js'

describe('buildAuthDisabledLog', () => {
  test('should nest all context under approved ECS fields', () => {
    const result = buildAuthDisabledLog({ entraEnabled: false, cognitoEnabled: false })

    expect(result).toEqual({
      msg: 'Authentication is disabled; every route will serve unauthenticated requests',
      event: {
        type: 'auth_disabled',
        outcome: 'unknown',
        reason: 'entraEnabled=false | cognitoEnabled=false'
      }
    })
  })

  test('should not emit any flat top-level context keys', () => {
    const result = buildAuthDisabledLog({ entraEnabled: false, cognitoEnabled: false })

    expect(Object.keys(result)).toEqual(['msg', 'event'])
  })

  test('should record the outcome as unknown rather than failure', () => {
    const result = buildAuthDisabledLog({ entraEnabled: false, cognitoEnabled: false })

    expect(result.event.outcome).toEqual('unknown')
  })
})

describe('buildAuthConfigurationFailureLog', () => {
  test('should nest all context under approved ECS fields', () => {
    const result = buildAuthConfigurationFailureLog({
      entraEnabled: true,
      cognitoEnabled: false,
      entraTenantCount: 0
    })

    expect(result).toEqual({
      msg: 'Authentication is enabled but no provider could be configured; every route will serve unauthenticated requests',
      event: {
        type: 'auth_configuration_failure',
        outcome: 'failure',
        reason: 'entraEnabled=true | cognitoEnabled=false | entraTenantCount=0'
      }
    })
  })

  test('should not emit any flat top-level context keys', () => {
    const result = buildAuthConfigurationFailureLog({
      entraEnabled: true,
      cognitoEnabled: false,
      entraTenantCount: 0
    })

    expect(Object.keys(result)).toEqual(['msg', 'event'])
  })

  test('should record the outcome as failure', () => {
    const result = buildAuthConfigurationFailureLog({
      entraEnabled: true,
      cognitoEnabled: false,
      entraTenantCount: 0
    })

    expect(result.event.outcome).toEqual('failure')
  })

  test('should report a non-zero tenant count when one is supplied', () => {
    const result = buildAuthConfigurationFailureLog({
      entraEnabled: true,
      cognitoEnabled: true,
      entraTenantCount: 2
    })

    expect(result.event.reason).toEqual('entraEnabled=true | cognitoEnabled=true | entraTenantCount=2')
  })
})
