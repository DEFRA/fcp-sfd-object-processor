import { describe, test, expect, vi, beforeEach } from 'vitest'
import { constants as httpConstants } from 'node:http2'

import { uploadCallback } from '../../../../src/api/v1/callback/index.js'
import * as metadataService from '../../../../src/services/metadata-service.js'
import { mockScanAndUploadResponse } from '../../../mocks/cdp-uploader.js'
import * as metricsModule from '../../../../src/api/common/helpers/metrics.js'
import * as validateCallbackModule from '../../../../src/api/v1/callback/validation/validate-callback-payload.js'

vi.mock('../../../../src/services/metadata-service.js')
vi.mock('../../../../src/api/common/helpers/metrics.js', () => ({ metricsCounter: vi.fn() }))

const buildMockH = () => ({
  response: (body) => ({
    body,
    code: (status) => ({
      status,
      body,
      takeover: () => ({ status, body })
    })
  })
})

describe('callback handler status enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  test('non-ready uploadStatus is persisted then returns 201', async () => {
    const payload = { ...mockScanAndUploadResponse, uploadStatus: 'pending' }

    metadataService.persistValidationFailureStatus.mockResolvedValue()

    const result = await uploadCallback.options.handler({ payload }, buildMockH())

    expect(metadataService.persistValidationFailureStatus).toHaveBeenCalledWith(payload, expect.any(Error))
    expect(result.status).toBe(201)
    expect(result.body).toBeDefined()
  })

  test('ready + complete payload persists metadata and returns 201', async () => {
    const payload = { ...mockScanAndUploadResponse, uploadStatus: 'ready' }

    metadataService.persistMetadataWithOutbox.mockResolvedValue({ insertedCount: 1, insertedIds: { 0: 'abc' } })

    const result = await uploadCallback.options.handler({ payload }, buildMockH())

    expect(metadataService.persistMetadataWithOutbox).toHaveBeenCalledWith(payload)
    expect(result.status).toBe(201)
    expect(result.body).toEqual({
      message: 'Metadata created',
      count: 1,
      ids: ['abc']
    })
  })

  test('ready + rejected payload persists validation failure and returns 201', async () => {
    const { s3Key, s3Bucket, checksumSha256, ...baseFile } = mockScanAndUploadResponse.form['a-file-upload-field']
    const rejectedFile = { ...baseFile, fileStatus: 'rejected', hasError: true, errorMessage: 'Virus detected' }
    const payload = { ...mockScanAndUploadResponse, uploadStatus: 'ready', form: { 'file-1': rejectedFile } }

    metadataService.persistValidationFailureStatus.mockResolvedValue()

    const result = await uploadCallback.options.handler({ payload }, buildMockH())

    expect(metadataService.persistValidationFailureStatus).toHaveBeenCalledWith(payload, expect.any(Error))
    expect(metadataService.persistMetadataWithOutbox).not.toHaveBeenCalled()
    expect(result.status).toBe(201)
    // Rejected files should trigger unexpected-status metric since fileStatus !== 'complete'
    expect(metricsModule.metricsCounter).toHaveBeenCalledWith('callback_unexpected_status')
  })

  test('duplicate callback returns 200 with existing correlationId', async () => {
    const payload = { ...mockScanAndUploadResponse, uploadStatus: 'ready' }
    const existingCorrelationId = '123e4567-e89b-12d3-a456-426655440000'

    metadataService.persistMetadataWithOutbox.mockResolvedValue({
      duplicate: true,
      correlationId: existingCorrelationId
    })

    const result = await uploadCallback.options.handler({ payload }, buildMockH())

    expect(metadataService.persistMetadataWithOutbox).toHaveBeenCalledWith(payload)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      message: 'Duplicate callback ignored',
      correlationId: existingCorrelationId
    })
  })

  test('duplicate callback with grouped array form returns 200 with existing correlationId and does not throw', async () => {
    const groupedPayload = {
      ...mockScanAndUploadResponse,
      uploadStatus: 'ready',
      form: {
        documents: [
          mockScanAndUploadResponse.form['a-file-upload-field'],
          mockScanAndUploadResponse.form['another-file-upload-field']
        ]
      }
    }
    const existingCorrelationId = '123e4567-e89b-12d3-a456-426655440000'

    metadataService.persistMetadataWithOutbox.mockResolvedValue({
      duplicate: true,
      correlationId: existingCorrelationId
    })

    const result = await uploadCallback.options.handler({ payload: groupedPayload }, buildMockH())

    expect(metadataService.persistMetadataWithOutbox).toHaveBeenCalledWith(groupedPayload)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      message: 'Duplicate callback ignored',
      correlationId: existingCorrelationId
    })
  })

  test('returns 500 when post-Joi validation throws', async () => {
    const payload = { ...mockScanAndUploadResponse, uploadStatus: 'ready' }
    vi.spyOn(validateCallbackModule, 'validateCallbackPayload').mockRejectedValue(new Error('validation exploded'))

    const result = await uploadCallback.options.handler({ payload }, buildMockH())

    expect(result.isBoom).toBe(true)
    expect(result.output.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
  })

  test('returns validation response when post-Joi validation fails', async () => {
    const payload = { ...mockScanAndUploadResponse, uploadStatus: 'ready' }
    const validationResponse = { status: 201, body: { message: 'Validation failure persisted' } }
    vi.spyOn(validateCallbackModule, 'validateCallbackPayload').mockResolvedValue(validationResponse)

    const result = await uploadCallback.options.handler({ payload }, buildMockH())

    expect(result).toBe(validationResponse)
    expect(metadataService.persistMetadataWithOutbox).not.toHaveBeenCalled()
  })

  test('returns 500 when persistence throws', async () => {
    const payload = { ...mockScanAndUploadResponse, uploadStatus: 'ready' }
    vi.spyOn(validateCallbackModule, 'validateCallbackPayload').mockResolvedValue(null)
    metadataService.persistMetadataWithOutbox.mockRejectedValue(new Error('db unavailable'))

    const result = await uploadCallback.options.handler({ payload }, buildMockH())

    expect(result.isBoom).toBe(true)
    expect(result.output.statusCode).toBe(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
  })
})

describe('uploadCallback validate.failAction', () => {
  const validationError = new Error('payload invalid')
  const request = { payload: { uploadStatus: 'pending' } }

  test('persists validation failure and returns 201 takeover response', async () => {
    metadataService.persistValidationFailureStatus.mockResolvedValue()
    const takeoverResult = { status: httpConstants.HTTP_STATUS_CREATED, body: { message: 'Validation failure persisted' } }
    const mockTakeover = vi.fn().mockReturnValue(takeoverResult)
    const h = {
      response: vi.fn().mockReturnValue({
        code: vi.fn().mockReturnValue({ takeover: mockTakeover })
      })
    }

    const result = await uploadCallback.options.validate.failAction(request, h, validationError)

    expect(metadataService.persistValidationFailureStatus).toHaveBeenCalledWith(request.payload, validationError)
    expect(metricsModule.metricsCounter).toHaveBeenCalledWith('callback_validation_failures')
    expect(h.response).toHaveBeenCalledWith({ message: 'Validation failure persisted' })
    expect(mockTakeover).toHaveBeenCalled()
    expect(result).toBe(takeoverResult)
  })

  test('still returns 201 when persistence of validation failure throws', async () => {
    metadataService.persistValidationFailureStatus.mockRejectedValue(new Error('status write failed'))
    const mockTakeover = vi.fn()
    const h = {
      response: vi.fn().mockReturnValue({
        code: vi.fn().mockReturnValue({ takeover: mockTakeover })
      })
    }

    await uploadCallback.options.validate.failAction(request, h, validationError)

    expect(mockTakeover).toHaveBeenCalled()
  })
})
