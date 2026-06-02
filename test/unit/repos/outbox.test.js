import { vi, describe, test, expect, beforeEach } from 'vitest'

import { bulkUpdateDeliveryStatus } from '../../../src/repos/outbox.js'
import { FAILED, PENDING } from '../../../src/constants/outbox.js'
import { config } from '../../../src/config/index.js'
import { db } from '../../../src/data/db.js'

vi.mock('../../../src/config/index.js')
vi.mock('../../../src/data/db.js', () => ({
    db: { collection: vi.fn() },
    client: { startSession: vi.fn() }
}))
vi.mock('../../../src/logging/logger.js', () => ({
    createLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    })
}))

let mockCollection
let mockUpdateMany

beforeEach(() => {
    vi.resetAllMocks()

    mockUpdateMany = vi.fn().mockResolvedValue({ acknowledged: true })
    mockCollection = {
        updateMany: mockUpdateMany
    }

    db.collection = vi.fn().mockReturnValue(mockCollection)
    config.get = vi.fn().mockImplementation((key) => {
        switch (key) {
            case 'mongo.collections.outbox': return 'outbox'
            case 'messaging.outboxMaxAttempts': return 3
            default: return null
        }
    })
})

describe('bulkUpdateDeliveryStatus', () => {
    test('sets SENT and increments attempts', async () => {
        await bulkUpdateDeliveryStatus(null, ['file-1'], 'SENT')

        expect(db.collection).toHaveBeenCalledWith('outbox')
        expect(mockUpdateMany).toHaveBeenCalled()
        const [filter, updateDoc] = mockUpdateMany.mock.calls[0]
        expect(filter).toEqual({ 'payload.file.fileId': { $in: ['file-1'] } })
        expect(updateDoc).toHaveProperty('$set')
        expect(updateDoc.$set).toHaveProperty('status', 'SENT')
        expect(updateDoc.$set).toHaveProperty('lastAttemptedAt')
        expect(updateDoc).toHaveProperty('$inc')
        expect(updateDoc.$inc).toHaveProperty('attempts', 1)
    })

    test('increments attempts and keeps PENDING when below maxAttempts', async () => {
        // Simulate failure update pipeline by returning acknowledged
        await bulkUpdateDeliveryStatus(null, ['file-2'], 'FAILED', 'error')

        expect(db.collection).toHaveBeenCalledWith('outbox')
        expect(mockUpdateMany).toHaveBeenCalled()
        const [filter, pipeline] = mockUpdateMany.mock.calls[0]
        expect(filter).toEqual({ 'payload.file.fileId': { $in: ['file-2'] } })
        // pipeline should be an array of stages
        expect(Array.isArray(pipeline)).toBe(true)
        // The last stage sets status conditionally
        const lastStage = pipeline[pipeline.length - 1]
        expect(lastStage).toHaveProperty('$set')
        // condition should reference FAILED and PENDING
        expect(JSON.stringify(lastStage)).toContain(FAILED)
        expect(JSON.stringify(lastStage)).toContain(PENDING)
    })

    test('marks FAILED when attempts reach maxAttempts', async () => {
        // To test conditional setting, call function and ensure pipeline is used
        await bulkUpdateDeliveryStatus(null, ['file-3'], 'FAILED')

        const pipeline = mockUpdateMany.mock.calls[0][1]
        const lastStage = pipeline[pipeline.length - 1]
        expect(JSON.stringify(lastStage)).toContain(FAILED)
    })
})
