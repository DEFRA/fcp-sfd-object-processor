import { vi, describe, beforeEach, test, expect } from 'vitest'
import { createLogger } from '../../../../../src/logging/logger.js'

const { mockNetworkInterfaces } = vi.hoisted(() => ({
  mockNetworkInterfaces: vi.fn()
}))

vi.mock('node:os', () => ({
  networkInterfaces: mockNetworkInterfaces
}))

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

// A single non-internal IPv4 interface, matching typical container network setup.
const externalIpv4Interfaces = {
  eth0: [
    { family: 'IPv4', internal: false, address: '10.1.2.3' }
  ]
}

const loopbackOnlyInterfaces = {
  lo: [
    { family: 'IPv4', internal: true, address: '127.0.0.1' }
  ]
}

describe('sendAuditEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockNetworkInterfaces.mockReturnValue(externalIpv4Interfaces)
  })

  test('should call publishAuditEvent with event and service-level config', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    await sendAuditEvent(mockAuditEvent)

    expect(publishAuditEvent).toHaveBeenCalledWith(
      mockAuditEvent,
      expect.objectContaining({
        application: 'fcp-sfd-object-processor',
        component: 'fcp-sfd-object-processor',
        version: '1.0.0',
        generateCorrelationId: true,
        ip: '10.1.2.3'
      })
    )
  })

  test('should retain an explicit correlationid instead of deleting it', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    const eventWithCorrelationId = { ...mockAuditEvent, correlationid: 'existing-correlation-id' }

    await sendAuditEvent(eventWithCorrelationId)

    expect(publishAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ correlationid: 'existing-correlation-id' }),
      expect.any(Object)
    )
  })

  test('should resolve ip from request.info.remoteAddress when no x-forwarded-for header', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    const request = { headers: {}, info: { remoteAddress: '192.168.1.10' } }

    await sendAuditEvent(mockAuditEvent, request)

    expect(publishAuditEvent).toHaveBeenCalledWith(
      mockAuditEvent,
      expect.objectContaining({ ip: '192.168.1.10' })
    )
  })

  test('should prefer the first entry of a multi-value x-forwarded-for header', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    const request = {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' },
      info: { remoteAddress: '10.0.0.99' }
    }

    await sendAuditEvent(mockAuditEvent, request)

    expect(publishAuditEvent).toHaveBeenCalledWith(
      mockAuditEvent,
      expect.objectContaining({ ip: '203.0.113.5' })
    )
  })

  test('should strip the zone id from an IPv6 x-forwarded-for address', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    const request = { headers: { 'x-forwarded-for': 'fe80::1%eth0' }, info: {} }

    await sendAuditEvent(mockAuditEvent, request)

    expect(publishAuditEvent).toHaveBeenCalledWith(
      mockAuditEvent,
      expect.objectContaining({ ip: 'fe80::1' })
    )
  })

  test('should strip a trailing port from an IPv4 remoteAddress', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    const request = { headers: {}, info: { remoteAddress: '1.2.3.4:5678' } }

    await sendAuditEvent(mockAuditEvent, request)

    expect(publishAuditEvent).toHaveBeenCalledWith(
      mockAuditEvent,
      expect.objectContaining({ ip: '1.2.3.4' })
    )
  })

  test('should fall back to the service IP when no request is provided', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    await sendAuditEvent(mockAuditEvent)

    expect(publishAuditEvent).toHaveBeenCalledWith(
      mockAuditEvent,
      expect.objectContaining({ ip: '10.1.2.3' })
    )
  })

  test('should fall back to 127.0.0.1 when no external network interface is available', async () => {
    mockNetworkInterfaces.mockReturnValue(loopbackOnlyInterfaces)

    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    await sendAuditEvent(mockAuditEvent)

    expect(publishAuditEvent).toHaveBeenCalledWith(
      mockAuditEvent,
      expect.objectContaining({ ip: '127.0.0.1' })
    )
  })

  test('should fall back to the service IP when the resolved IP exceeds 20 characters', async () => {
    const { publishAuditEvent } = await import('@defra/fcp-audit-publisher')
    const { sendAuditEvent } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    const request = { headers: { 'x-forwarded-for': '2001:0db8:85a3:0000:0000:8a2e:0370:7334extra' }, info: {} }

    await sendAuditEvent(mockAuditEvent, request)

    expect(publishAuditEvent).toHaveBeenCalledWith(
      mockAuditEvent,
      expect.objectContaining({ ip: '10.1.2.3' })
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

describe('extractIp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockNetworkInterfaces.mockReturnValue(externalIpv4Interfaces)
  })

  test('prefers x-forwarded-for over remoteAddress', async () => {
    const { extractIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    const request = {
      headers: { 'x-forwarded-for': '203.0.113.5' },
      info: { remoteAddress: '10.0.0.99' }
    }

    expect(extractIp(request)).toBe('203.0.113.5')
  })

  test('falls back to remoteAddress when x-forwarded-for is absent', async () => {
    const { extractIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    expect(extractIp({ headers: {}, info: { remoteAddress: '192.168.1.10' } })).toBe('192.168.1.10')
  })

  test('falls back to the service IP when request is undefined', async () => {
    const { extractIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    expect(extractIp()).toBe('10.1.2.3')
  })

  test('falls back to the service IP when request has no usable ip fields', async () => {
    const { extractIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    expect(extractIp({ headers: {}, info: {} })).toBe('10.1.2.3')
  })
})

describe('getServiceIp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('returns the first non-internal IPv4 address found', async () => {
    mockNetworkInterfaces.mockReturnValue(externalIpv4Interfaces)
    const { getServiceIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    expect(getServiceIp()).toBe('10.1.2.3')
  })

  test('falls back to 127.0.0.1 when no non-internal IPv4 interface exists', async () => {
    mockNetworkInterfaces.mockReturnValue(loopbackOnlyInterfaces)
    const { getServiceIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    expect(getServiceIp()).toBe('127.0.0.1')
  })

  test('falls back to 127.0.0.1 and logs a warning when networkInterfaces throws', async () => {
    mockNetworkInterfaces.mockImplementation(() => { throw new Error('unavailable') })
    const { getServiceIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    expect(getServiceIp()).toBe('127.0.0.1')
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { event: { type: 'service_ip_resolution_failed', outcome: 'failure', reason: 'unavailable' } },
      'Failed to resolve service IP from network interfaces, falling back to loopback'
    )
  })

  test('skips interface entries with no address list', async () => {
    mockNetworkInterfaces.mockReturnValue({
      lo: undefined,
      eth0: [{ family: 'IPv4', internal: false, address: '10.9.9.9' }]
    })
    const { getServiceIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    expect(getServiceIp()).toBe('10.9.9.9')
  })

  test('caches the resolved ip across calls within the same module instance', async () => {
    mockNetworkInterfaces.mockReturnValue(externalIpv4Interfaces)
    const { getServiceIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    getServiceIp()
    mockNetworkInterfaces.mockReturnValue(loopbackOnlyInterfaces)

    expect(getServiceIp()).toBe('10.1.2.3')
    expect(mockNetworkInterfaces).toHaveBeenCalledTimes(1)
  })
})

describe('sanitiseIp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('returns empty string for non-string input', async () => {
    const { sanitiseIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    expect(sanitiseIp(undefined)).toBe('')
    expect(sanitiseIp(null)).toBe('')
    expect(sanitiseIp(123)).toBe('')
  })

  test('returns empty string for an IP longer than 20 characters', async () => {
    const { sanitiseIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    expect(sanitiseIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334extra')).toBe('')
  })

  test('returns empty string when the input sanitises down to nothing', async () => {
    const { sanitiseIp } = await import('../../../../../src/messaging/outbound/audit/send-audit-event.js')

    expect(sanitiseIp(',,,')).toBe('')
    expect(sanitiseIp('   ')).toBe('')
  })
})
