import { vi, describe, beforeEach, test, expect } from 'vitest'
import { createLogger } from '../../../../../src/logging/logger.js'
import { assertValidAuditEvent } from '../../../../helpers/validate-audit-payload.js'

vi.mock('@defra/fcp-audit-publisher', () => ({
  publishAuditEvent: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  validateAuditEvent: vi.fn().mockReturnValue({ valid: true, errors: [] })
}))

vi.mock('../../../../../src/messaging/sns/client.js', () => ({
  snsClient: {}
}))

vi.mock('../../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => {
      const values = {
        'aws.messaging.topics.auditEvents': 'arn:aws:sns:eu-west-2:000000000000:fcp_audit_fcp_sfd_object_processor',
        serviceName: 'fcp-sfd-object-processor',
        cdpEnvironment: 'test'
      }
      return values[key]
    })
  }
}))

vi.mock('../../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

const mockLogger = createLogger()

const mockAuditEvent = {
  audit: {
    entities: [
      { entity: 'document', action: 'uploaded' }
    ],
    accounts: {
      sbi: '123456789'
    }
  }
}

describe('sendAuditEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should call publishAuditEvent with event and service-level config', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')

    assertValidAuditEvent(mockAuditEvent)

    await publishAuditEvent(mockAuditEvent)

    expect(publishAuditEvent).toHaveBeenCalledWith(
      mockAuditEvent,
      expect.objectContaining({
        application: 'fcp-sfd-object-processor',
        component: 'fcp-sfd-object-processor',
        version: '1.0.0',
        generateCorrelationId: true,
        ip: '0.0.0.0'
      })
    )
  })

  test('should not throw when publishAuditEvent rejects', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    publishAuditEvent.mockRejectedValueOnce(new Error('SNS failure'))

    await expect(sendAuditEvent(mockAuditEvent)).resolves.not.toThrow()
  })

  test('should log error when publishAuditEvent rejects', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    const mockError = new Error('SNS failure')
    publishAuditEvent.mockRejectedValueOnce(mockError)

    await sendAuditEvent(mockAuditEvent)

    expect(mockLogger.error).toHaveBeenCalledWith(
      { event: { type: 'audit_publish_failed', outcome: 'failure', reason: mockError.message } },
      'Failed to publish audit event'
    )
  })
})
