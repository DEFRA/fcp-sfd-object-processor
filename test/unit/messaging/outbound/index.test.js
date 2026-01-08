import { beforeEach, describe, expect, vi, test } from 'vitest'
import { startOutbox } from '../../../../src/messaging/outbound/index.js'
import { publishPendingMessages } from '../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js'

vi.mock('../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js', () => ({
  publishPendingMessages: vi.fn().mockResolvedValue(undefined)
}))

describe('startOutbox tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('startOutbox', () => {
    describe('when startOutbox encounters an error', () => {
      test('should throw the error', async () => {
        const testError = new Error('Test error')
        publishPendingMessages.mockRejectedValueOnce(testError)

        expect(startOutbox()).rejects.toThrow('Outbox processing failed: Test error')
      })

      test('startOutbox should be called again via the finally block', async () => {
        const testError = new Error('Test error')
        publishPendingMessages.mockRejectedValueOnce(testError)
        const timeoutSpy = vi.spyOn(global, 'setTimeout')

        try {
          await startOutbox()
        } catch (error) {
          // ignoring the error for this test as I want to check that the timeout function from finally is called.
        }

        expect(timeoutSpy).toHaveBeenCalledWith(startOutbox, 30000)
      })
    })
    describe('when startOutbox processes successfully', () => {
      test('startOutbox should be called again via the finally block', async () => {
        const timeoutSpy = vi.spyOn(global, 'setTimeout')

        try {
          await startOutbox()
        } catch (error) {
          // no error is thrown in this test case
        }
        expect(timeoutSpy).toHaveBeenCalledWith(startOutbox, 30000)
      })
    })
  })
})
