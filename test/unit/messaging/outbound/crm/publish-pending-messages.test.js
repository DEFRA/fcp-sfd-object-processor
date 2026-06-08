import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockInfo = vi.fn()
const mockError = vi.fn()
vi.mock('../../../../../src/logging/logger.js', () => ({
    createLogger: () => ({ info: mockInfo, error: mockError })
}))

vi.mock('../../../../../src/config/index.js', () => ({
    config: {
        get: vi.fn((key) => {
            if (key === 'messaging.outboxMaxAttempts') return 2
            return null
        })
    }
}))

const mockGetProcessable = vi.fn()
vi.mock('../../../../../src/repos/outbox.js', () => ({
    getProcessableOutboxEntries: () => mockGetProcessable(),
    bulkUpdateDeliveryStatus: vi.fn()
}))

const mockBulkUpdatePublishedAtDate = vi.fn()
vi.mock('../../../../../src/repos/metadata.js', () => ({
    bulkUpdatePublishedAtDate: (...args) => mockBulkUpdatePublishedAtDate(...args)
}))

const mockPublishBatch = vi.fn()
vi.mock('../../../../../src/messaging/outbound/crm/doc-upload/publish-document-upload-message-batch.js', () => ({
    publishDocumentUploadMessageBatch: (...args) => mockPublishBatch(...args)
}))

const mockStartSession = vi.fn()
vi.mock('../../../../../src/data/db.js', () => ({
    client: { startSession: () => mockStartSession() }
}))

let publishPendingMessages
let bulkUpdateDeliveryStatus

describe('publishPendingMessages', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // default session mock
        const session = {
            withTransaction: vi.fn(async (cb) => cb()),
            endSession: vi.fn()
        }
        mockStartSession.mockReturnValue(session)
        // dynamically import the module under test after mocks are set up
        return (async () => {
            const mod = await import('../../../../../src/messaging/outbound/crm/doc-upload/publish-pending-messages.js')
            publishPendingMessages = mod.publishPendingMessages
            const outbox = await import('../../../../../src/repos/outbox.js')
            bulkUpdateDeliveryStatus = outbox.bulkUpdateDeliveryStatus
        })()
    })

    it('returns early when no pending messages', async () => {
        mockGetProcessable.mockResolvedValue([])
        await publishPendingMessages()
        expect(mockInfo).toHaveBeenCalled()
        // ensure no publish calls
        expect(mockPublishBatch).not.toHaveBeenCalled()
    })

    it('processes successful messages and updates status and publishedAt', async () => {
        const entry = { messageId: 'm1', _id: 'id1' }
        mockGetProcessable.mockResolvedValue([entry])
        mockPublishBatch.mockResolvedValue({ Successful: [{ Id: 'm1' }], Failed: [] })

        await publishPendingMessages()

        expect(mockPublishBatch).toHaveBeenCalled()
        expect(bulkUpdateDeliveryStatus).toHaveBeenCalled()
        expect(mockBulkUpdatePublishedAtDate).toHaveBeenCalled()
        expect(mockInfo).toHaveBeenCalled()
    })

    it('logs imminent terminal failures when attempts reach maxAttempts', async () => {
        const entry = { messageId: 'm2', _id: 'id2', attempts: 1 }
        mockGetProcessable.mockResolvedValue([entry])
        mockPublishBatch.mockResolvedValue({ Successful: [], Failed: [{ Id: 'm2', Message: 'boom' }] })

        await publishPendingMessages()

        // bulk update should have been called for failed
        expect(bulkUpdateDeliveryStatus).toHaveBeenCalled()
        // logger.error should be called for imminent terminal
        const calledWith = mockError.mock.calls.find(call => JSON.stringify(call[0]).includes('outbox_terminal_failure_imminent'))
        expect(calledWith).toBeDefined()
    })

    it('rethrows when publishDocumentUploadMessageBatch throws', async () => {
        mockGetProcessable.mockResolvedValue([{ messageId: 'm3' }])
        mockPublishBatch.mockRejectedValue(new Error('publish failed'))

        await expect(publishPendingMessages()).rejects.toThrow('publish failed')
        // ensure session end is still called
        const session = mockStartSession()
        expect(session.endSession).toHaveBeenCalled()
    })
})
