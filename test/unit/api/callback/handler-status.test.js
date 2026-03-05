import { describe, test, expect, vi, beforeEach } from 'vitest'

import { uploadCallback } from '../../../../src/api/v1/callback/index.js'
import * as metadataService from '../../../../src/services/metadata-service.js'
import { mockScanAndUploadResponse } from '../../../mocks/cdp-uploader.js'
import * as metricsModule from '../../../../src/api/common/helpers/metrics.js'

vi.mock('../../../../src/services/metadata-service.js')
vi.mock('../../../../src/api/common/helpers/metrics.js', () => ({ metricsCounter: vi.fn() }))

describe('callback handler status enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('non-ready uploadStatus is persisted then returns 201', async () => {
    const payload = { ...mockScanAndUploadResponse, uploadStatus: 'pending' }

    metadataService.persistValidationFailureStatus.mockResolvedValue()

    const h = {
      response: (body) => ({
        body,
        code: (status) => ({ status, body })
      })
    }

    const result = await uploadCallback.options.handler({ payload }, h)

    expect(metadataService.persistValidationFailureStatus).toHaveBeenCalledWith(payload, expect.any(Error))
    expect(result.status).toBe(201)
    expect(result.body).toBeDefined()
  })

  test('ready + complete payload persists metadata and returns 201', async () => {
    const payload = { ...mockScanAndUploadResponse, uploadStatus: 'ready' }

    metadataService.persistMetadataWithOutbox.mockResolvedValue({ insertedCount: 1, insertedIds: { 0: 'abc' } })

    const h = {
      response: (body) => ({
        body,
        code: (status) => ({ status, body })
      })
    }

    const result = await uploadCallback.options.handler({ payload }, h)

    expect(metadataService.persistMetadataWithOutbox).toHaveBeenCalledWith(payload)
    expect(result.status).toBe(201)
  })

  test('ready + rejected payload persists metadata and returns 201 (no alert)', async () => {
    const rejectedFile = { ...mockScanAndUploadResponse.form['a-file-upload-field'], fileStatus: 'rejected', hasError: true, errorMessage: 'Virus detected' }
    const payload = { ...mockScanAndUploadResponse, uploadStatus: 'ready', form: { 'file-1': rejectedFile } }

    metadataService.persistMetadataWithOutbox.mockResolvedValue({ insertedCount: 1, insertedIds: { 0: 'abc' } })

    const h = {
      response: (body) => ({
        body,
        code: (status) => ({ status, body })
      })
    }

    const result = await uploadCallback.options.handler({ payload }, h)

    expect(metadataService.persistMetadataWithOutbox).toHaveBeenCalledWith(payload)
    expect(result.status).toBe(201)
    // Ensure no unexpected-status metric was emitted for rejected files
    expect(metricsModule.metricsCounter).not.toHaveBeenCalledWith('callback_unexpected_status')
  })
})
