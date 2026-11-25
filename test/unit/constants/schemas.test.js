import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { schemaConsts } from '../../../src/constants/schemas.js'
import { submissionFields } from '../../../src/api/v1/schemas/uploader-common.js'

const asyncApiPath = fileURLToPath(new URL('../../../docs/asyncapi/v1.yaml', import.meta.url))

// Reads the scalar properties of one entry under components.schemas in
// docs/asyncapi/v1.yaml. A line parser is used so the test has no YAML library
// dependency. It returns undefined if the entry is not found, so a change to the
// document layout fails the test rather than passing silently.
const readAsyncApiSchema = (name) => {
  const lines = readFileSync(asyncApiPath, 'utf8').split('\n')
  const schemasIndex = lines.indexOf('  schemas:')
  const start = lines.indexOf(`    ${name}:`, schemasIndex)
  if (schemasIndex === -1 || start === -1) {
    return undefined
  }

  const properties = {}
  for (const line of lines.slice(start + 1)) {
    const match = /^ {6}(\w+): (.*)$/.exec(line)
    if (!match) {
      break
    }
    properties[match[1]] = match[2].replace(/^"(.*)"$/, '$1')
  }
  return properties
}

// These literals are the ranges published in docs/asyncapi/v1.yaml, the event
// contract CRM and FDM validate against. They are asserted as literals rather
// than read from the constants so that a change to the constants alone cannot
// silently drift away from the contract.
describe('schemaConsts business identifier ranges', () => {
  test('sbi range matches the published event contract', () => {
    expect(schemaConsts.SBI_MIN).toBe(105000000)
    expect(schemaConsts.SBI_MAX).toBe(999999999)
  })

  test('crn range matches the published event contract', () => {
    expect(schemaConsts.CRN_MIN).toBe(1050000000)
    expect(schemaConsts.CRN_MAX).toBe(9999999999)
  })

  test('sbi and crn examples fall within their ranges', () => {
    expect(schemaConsts.SBI_EXAMPLE).toBeGreaterThanOrEqual(schemaConsts.SBI_MIN)
    expect(schemaConsts.SBI_EXAMPLE).toBeLessThanOrEqual(schemaConsts.SBI_MAX)
    expect(schemaConsts.CRN_EXAMPLE).toBeGreaterThanOrEqual(schemaConsts.CRN_MIN)
    expect(schemaConsts.CRN_EXAMPLE).toBeLessThanOrEqual(schemaConsts.CRN_MAX)
  })
})

// submissionId is defined once in Joi (submissionFields) and published by hand in
// docs/asyncapi/v1.yaml, the event contract CRM and FDM validate against. These
// tests fail if the two disagree on type, format, description or example.
describe('submissionId matches the published event contract', () => {
  const contract = readAsyncApiSchema('submissionId')
  const joi = submissionFields.submissionId.describe()

  test('is present in docs/asyncapi/v1.yaml', () => {
    expect(contract).toBeDefined()
  })

  test('has the same type as the Joi schema', () => {
    expect(contract.type).toBe(joi.type)
  })

  test('declares a uuid format only if the Joi schema enforces one', () => {
    const joiEnforcesUuid = (joi.rules ?? []).some(rule => rule.name === 'guid')
    expect(contract.format).toBe(joiEnforcesUuid ? 'uuid' : undefined)
  })

  test('has the same description as the Joi schema', () => {
    expect(contract.description).toBe(joi.flags.description)
  })

  test('has the same example as the Joi schema', () => {
    expect(contract.example).toBe(schemaConsts.SUBMISSION_ID_EXAMPLE)
  })
})
