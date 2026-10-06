import convict from 'convict'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { databaseConfig } from '../../../src/config/database.js'
import { positiveInt } from '../../../src/config/formats/positive-int.js'

convict.addFormat(positiveInt)

// Only the keys under test are loaded, so validation failures can come from
// nothing else in the mongo block (readPreference, for example, defaults to null).
const createConfig = () => {
  const { metadataSbiPageSize, metadataSbiMaxPageSize, statusQueryLimit } = databaseConfig.mongo

  return convict({ mongo: { metadataSbiPageSize, metadataSbiMaxPageSize, statusQueryLimit } })
}

describe('metadata by SBI page size configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('returns 100 records per page by default', () => {
    vi.stubEnv('MONGO_METADATA_SBI_PAGE_SIZE', undefined)

    const config = createConfig()

    expect(config.get('mongo.metadataSbiPageSize')).toBe(100)
  })

  test('reads the page size from the environment', () => {
    vi.stubEnv('MONGO_METADATA_SBI_PAGE_SIZE', '50')

    const config = createConfig()
    config.validate({ allowed: 'strict' })

    expect(config.get('mongo.metadataSbiPageSize')).toBe(50)
  })

  test('rejects a non-integer page size', () => {
    vi.stubEnv('MONGO_METADATA_SBI_PAGE_SIZE', 'invalid')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })

  test('rejects zero for the page size', () => {
    vi.stubEnv('MONGO_METADATA_SBI_PAGE_SIZE', '0')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })

  test('rejects a negative page size', () => {
    vi.stubEnv('MONGO_METADATA_SBI_PAGE_SIZE', '-5')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })
})

describe('metadata by SBI maximum page size configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('allows at most 200 records per page by default', () => {
    vi.stubEnv('MONGO_METADATA_SBI_MAX_PAGE_SIZE', undefined)

    const config = createConfig()

    expect(config.get('mongo.metadataSbiMaxPageSize')).toBe(200)
  })

  test('reads the maximum page size from the environment', () => {
    vi.stubEnv('MONGO_METADATA_SBI_MAX_PAGE_SIZE', '150')

    const config = createConfig()
    config.validate({ allowed: 'strict' })

    expect(config.get('mongo.metadataSbiMaxPageSize')).toBe(150)
  })

  test('rejects a non-integer maximum page size', () => {
    vi.stubEnv('MONGO_METADATA_SBI_MAX_PAGE_SIZE', 'invalid')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })

  test('rejects zero for the maximum page size', () => {
    vi.stubEnv('MONGO_METADATA_SBI_MAX_PAGE_SIZE', '0')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })

  test('rejects a negative maximum page size', () => {
    vi.stubEnv('MONGO_METADATA_SBI_MAX_PAGE_SIZE', '-5')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })
})

describe('status query limit configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('limits a status query to 100 records by default', () => {
    vi.stubEnv('MONGO_STATUS_QUERY_LIMIT', undefined)

    const config = createConfig()

    expect(config.get('mongo.statusQueryLimit')).toBe(100)
  })

  test('reads the status query limit from the environment', () => {
    vi.stubEnv('MONGO_STATUS_QUERY_LIMIT', '250')

    const config = createConfig()
    config.validate({ allowed: 'strict' })

    expect(config.get('mongo.statusQueryLimit')).toBe(250)
  })

  test('rejects a non-integer status query limit', () => {
    vi.stubEnv('MONGO_STATUS_QUERY_LIMIT', 'invalid')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })

  test('rejects zero for the status query limit', () => {
    vi.stubEnv('MONGO_STATUS_QUERY_LIMIT', '0')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })

  test('rejects a negative status query limit', () => {
    vi.stubEnv('MONGO_STATUS_QUERY_LIMIT', '-5')

    const config = createConfig()

    expect(() => config.validate({ allowed: 'strict' })).toThrow()
  })
})
