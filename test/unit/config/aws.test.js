import { beforeEach, afterEach, describe, test, expect } from 'vitest'
import convict from 'convict'
import { awsConfig } from '../../../src/config/aws.js'

const buildConfig = () => convict({ ...awsConfig })

describe('awsConfig — auditEvents fail-fast validation', () => {
  const originalEnv = process.env.AUDIT_TOPIC_ARN

  beforeEach(() => {
    delete process.env.AUDIT_TOPIC_ARN
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AUDIT_TOPIC_ARN
    } else {
      process.env.AUDIT_TOPIC_ARN = originalEnv
    }
  })

  test('throws at validation when AUDIT_TOPIC_ARN is not set', () => {
    const config = buildConfig()
    expect(() => config.validate({ allowed: 'strict' })).toThrow(
      /auditEvents.*must be of type String/
    )
  })

  test('does not throw when AUDIT_TOPIC_ARN is set to a valid ARN', () => {
    process.env.AUDIT_TOPIC_ARN = 'arn:aws:sns:eu-west-2:000000000000:fcp_audit_fcp_sfd_object_processor'
    const config = buildConfig()
    expect(() => config.validate({ allowed: 'strict' })).not.toThrow()
  })
})
