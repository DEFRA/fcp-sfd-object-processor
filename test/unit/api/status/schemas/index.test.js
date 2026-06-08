import { describe, test, expect } from 'vitest'

import * as schemasIndex from '../../../../../src/api/v1/status/schemas/index.js'
import { statusParamSchema } from '../../../../../src/api/v1/status/schemas/params.js'
import { statusResponseSchema } from '../../../../../src/api/v1/status/schemas/responses.js'

describe('status schemas index re-exports', () => {
    test('should re-export statusParamSchema', () => {
        expect(schemasIndex.statusParamSchema).toBeDefined()
        expect(schemasIndex.statusParamSchema).toBe(statusParamSchema)
    })

    test('should re-export statusResponseSchema', () => {
        expect(schemasIndex.statusResponseSchema).toBeDefined()
        expect(schemasIndex.statusResponseSchema).toBe(statusResponseSchema)
    })
})
