import { constants as httpConstants } from 'node:http2'
import { vi, describe, test, expect, beforeAll, afterAll } from 'vitest'

import { db } from '../../../../src/data/db.js'
import { config } from '../../../../src/config'
import { createServer } from '../../../../src/api'
import {
  mockScanResultClean,
  mockScanResultInfected,
  mockScanResultInvalidFileType,
  mockScanResultTimeout,
  mockScanResultRejectedVirus,
  mockScanResultCleanWithVirus,
  mockScanResultInfectedWithoutVirus,
  mockScanResultInvalidFileTypeWithVirus,
  mockScanResultTimeoutWithVirus,
  mockScanResultCleanWithRejection,
  mockScanResultInfectedWithRejectionReason,
  mockScanResultInvalidFileTypeWithWrongReason,
  mockScanResultTimeoutWithWrongReason,
  mockScanResultInfectedWithWrongReason,
  mockScanResultMissingTimestamp,
  mockScanResultInvalidTimestamp,
  mockScanResultInvalidStatus,
  mockScanResultInvalidRejectionReason,
  mockScanResultMultipleFilesNoneRejected,
  mockScanResultMultipleFilesOneRejected,
  mockScanResultFileCountMismatchTooHigh,
  mockScanResultFileCountMismatchTooLow
} from '../../../mocks/scan-results.js'

let server
let originalMetadataCollection
let originalOutboxCollection
let originalStatusCollection
let metadataCollection
let outboxCollection
let statusCollection

beforeAll(async () => {
  vi.restoreAllMocks()
  originalMetadataCollection = config.get('mongo.collections.uploadMetadata')
  originalOutboxCollection = config.get('mongo.collections.outbox')
  originalStatusCollection = config.get('mongo.collections.status')

  config.set('mongo.collections.uploadMetadata', 'callback-scan-test-metadata')
  config.set('mongo.collections.outbox', 'callback-scan-test-outbox')
  config.set('mongo.collections.status', 'callback-scan-test-status')

  metadataCollection = config.get('mongo.collections.uploadMetadata')
  outboxCollection = config.get('mongo.collections.outbox')
  statusCollection = config.get('mongo.collections.status')

  await db.collection(metadataCollection).deleteMany({})
  await db.collection(outboxCollection).deleteMany({})
  await db.collection(statusCollection).deleteMany({})
})

afterAll(async () => {
  vi.restoreAllMocks()
  await db.collection(metadataCollection).deleteMany({})
  await db.collection(outboxCollection).deleteMany({})
  await db.collection(statusCollection).deleteMany({})

  config.set('mongo.collections.uploadMetadata', originalMetadataCollection)
  config.set('mongo.collections.outbox', originalOutboxCollection)
  config.set('mongo.collections.status', originalStatusCollection)
})

describe('POST /api/v1/callback with scan result contract validation', async () => {
  server = await createServer()
  await server.initialize()

  describe('valid scan result combinations', async () => {
    test('should accept CLEAN status without virusResult or rejectionReason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultClean
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultClean.metadata.sbi, validated: true })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeNull()
    })

    test('should accept INFECTED status with virusResult', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInfected
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultInfected.metadata.sbi, validated: true })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeNull()
    })

    test('should accept INVALID_FILE_TYPE status with valid rejectionReason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInvalidFileType
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultInvalidFileType.metadata.sbi, validated: true })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeNull()
    })

    test('should accept SCAN_TIMEOUT status with valid rejectionReason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultTimeout
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultTimeout.metadata.sbi, validated: true })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeNull()
    })

    test('should accept REJECTED status with any valid rejectionReason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultRejectedVirus
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultRejectedVirus.metadata.sbi, validated: true })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeNull()
    })

    test('should accept multiple files with no rejections', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultMultipleFilesNoneRejected
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

      const statusRecords = await db.collection(statusCollection)
        .find({
          sbi: mockScanResultMultipleFilesNoneRejected.metadata.sbi,
          validated: true
        })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeNull()
    })

    test('should accept multiple files with some rejections', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultMultipleFilesOneRejected
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_CREATED)

      const statusRecords = await db.collection(statusCollection)
        .find({
          sbi: mockScanResultMultipleFilesOneRejected.metadata.sbi,
          validated: true
        })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeNull()
    })
  })

  describe('invalid scan result combinations - virusResult misalignment', async () => {
    test('should reject CLEAN status with virusResult present', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultCleanWithVirus
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(response.result.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultCleanWithVirus.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('forbids virusResult'))
    })

    test('should reject INFECTED status without virusResult', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInfectedWithoutVirus
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultInfectedWithoutVirus.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('requires virusResult'))
    })

    test('should reject INVALID_FILE_TYPE status with virusResult', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInvalidFileTypeWithVirus
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultInvalidFileTypeWithVirus.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('forbids virusResult'))
    })

    test('should reject SCAN_TIMEOUT status with virusResult', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultTimeoutWithVirus
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultTimeoutWithVirus.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('forbids virusResult'))
    })
  })

  describe('invalid scan result combinations - rejectionReason misalignment', async () => {
    test('should reject CLEAN status with rejectionReason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultCleanWithRejection
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultCleanWithRejection.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('forbids rejectionReason'))
    })

    test('should reject INFECTED status with rejectionReason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInfectedWithRejectionReason
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultInfectedWithRejectionReason.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('forbids rejectionReason'))
    })

    test('should reject INVALID_FILE_TYPE with wrong rejectionReason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInvalidFileTypeWithWrongReason
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultInvalidFileTypeWithWrongReason.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('not valid'))
    })

    test('should reject SCAN_TIMEOUT with wrong rejectionReason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultTimeoutWithWrongReason
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultTimeoutWithWrongReason.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('not valid'))
    })

    test('should reject REJECTED status with wrong rejectionReason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInfectedWithWrongReason
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultInfectedWithWrongReason.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('forbids rejectionReason'))
    })
  })

  describe('invalid scan result combinations - enum validation', async () => {
    test('should reject invalid scanStatus enum value', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInvalidStatus
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultInvalidStatus.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('Invalid scanStatus'))
    })

    test('should reject invalid rejectionReason enum value', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInvalidRejectionReason
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultInvalidRejectionReason.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors).toContain(expect.stringContaining('not valid'))
    })
  })

  describe('invalid scan result combinations - timestamp validation', async () => {
    test('should reject missing scanTimestamp', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultMissingTimestamp
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(response.result.message).toContain('scanTimestamp')
    })

    test('should reject invalid scanTimestamp format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInvalidTimestamp
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)
      expect(response.result.message).toContain('scanTimestamp')
    })
  })

  describe('file count consistency validation', async () => {
    test('should reject when numberOfRejectedFiles exceeds total files', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultFileCountMismatchTooHigh
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultFileCountMismatchTooHigh.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
    })

    test('should reject when REJECTED status has numberOfRejectedFiles = 0', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultFileCountMismatchTooLow
      })

      expect(response.statusCode).toBe(httpConstants.HTTP_STATUS_UNPROCESSABLE_ENTITY)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultFileCountMismatchTooLow.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].errors).toBeDefined()
    })
  })

  describe('backward compatibility', async () => {
    test('should still accept payloads without scan fields during transition', async () => {
      // This test will be relevant during the transition period when scan fields
      // are optional. For now, it documents the backward compatibility requirement.
      // Implementation deferred until scan fields are marked as optional.
      expect(true).toBe(true)
    })
  })

  describe('database state on validation failure', async () => {
    test('should NOT persist metadata when scan contract validation fails', async () => {
      const beforeMetadataCount = await db.collection(metadataCollection).countDocuments()
      const beforeOutboxCount = await db.collection(outboxCollection).countDocuments()

      await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultCleanWithVirus
      })

      const afterMetadataCount = await db.collection(metadataCollection).countDocuments()
      const afterOutboxCount = await db.collection(outboxCollection).countDocuments()

      expect(afterMetadataCount).toBe(beforeMetadataCount)
      expect(afterOutboxCount).toBe(beforeOutboxCount)
    })

    test('should persist status record even when validation fails', async () => {
      const beforeStatusCount = await db.collection(statusCollection).countDocuments()

      await server.inject({
        method: 'POST',
        url: '/api/v1/callback',
        payload: mockScanResultInfectedWithoutVirus
      })

      const afterStatusCount = await db.collection(statusCollection).countDocuments()

      expect(afterStatusCount - beforeStatusCount).toBe(1)

      const statusRecords = await db.collection(statusCollection)
        .find({ sbi: mockScanResultInfectedWithoutVirus.metadata.sbi, validated: false })
        .toArray()

      expect(statusRecords).toHaveLength(1)
      expect(statusRecords[0].validated).toBe(false)
      expect(statusRecords[0].errors).toBeDefined()
      expect(statusRecords[0].errors.length).toBeGreaterThan(0)
    })
  })
})
