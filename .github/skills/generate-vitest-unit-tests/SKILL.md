---
name: generate-vitest-unit-tests
description: "Generate Vitest unit tests matching this project's conventions. Use when: writing tests, creating test files, adding unit test coverage, testing a module, generating tests for new code."
---

# Generate Vitest Unit Tests

Generate unit tests that match the established patterns in this codebase. **Never change the source code to make it easier to test.**

## Before Writing Tests

1. **Read the source file** you are testing — understand every export, branch, and dependency.
2. **Read 1–2 existing test files** for similar modules (same layer: api, service, repo, messaging, utils) to absorb the exact local style.
3. **Check `test/mocks/`** for reusable mock data before creating inline fixtures.

## File Placement & Naming

- Place tests in `test/unit/` mirroring the `src/` directory structure.
- Name files `<module-name>.test.js` (e.g., `src/repos/metadata.js` → `test/unit/repos/metadata/metadata.test.js`).

## Imports

Always import test utilities explicitly from `vitest` — **never rely on globals**:

```javascript
import { describe, test, expect, vi, beforeEach } from 'vitest'
```

Import only the hooks you actually use (e.g., omit `afterEach` if not needed).

Import the module under test with its full relative path including `.js` extension:

```javascript
import { myFunction } from '../../../../src/services/my-service.js'
```

Import shared mock data from `test/mocks/` when applicable:

```javascript
import { mockScanAndUploadResponse } from '../../../mocks/cdp-uploader.js'
```

## Test Structure

Use `test()` — **never** `it()`. Group with `describe()` blocks:

```javascript
describe('Module or function name', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('specific behaviour group', () => {
    test('should do something specific', async () => {
      // arrange → act → assert
    })
  })
})
```

### Naming Conventions

Start test descriptions with **"should"** for behaviour, or use descriptive condition-based names:

```javascript
// Behaviour-style
test('should persist metadata and return 201', async () => {})
test('should throw error when insert is not acknowledged', async () => {})

// Condition-style
test('non-ready uploadStatus is persisted then returns 201', async () => {})
test('ready + rejected payload persists validation failure and returns 201', async () => {})
```

## Mocking Patterns

### Module Mocks with `vi.mock()`

Place `vi.mock()` calls at the **top level**, after imports:

```javascript
vi.mock('../../../../src/data/db.js', () => ({
  db: { collection: vi.fn() },
  client: { startSession: vi.fn() }
}))
```

For auto-mocking all exports (when you configure return values in `beforeEach`):

```javascript
vi.mock('../../../../src/repos/metadata.js')
```

### Database Mocking

**Never mock the `mongodb` package** — always mock `src/data/db.js`:

```javascript
vi.mock('../../../../src/data/db.js', () => ({
  db: { collection: vi.fn() },
  client: { startSession: vi.fn() }
}))
```

### Logger Mocking

```javascript
vi.mock('../../../../src/logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))
```

### Config Mocking

```javascript
vi.mock('../../../../src/config/index.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'mongo.collections.uploadMetadata') return 'uploadMetadata'
      return null
    })
  }
}))
```

Or with a named mock for per-test overrides:

```javascript
const mockConfigGet = vi.fn()
vi.mock('../../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

// In beforeEach:
mockConfigGet.mockImplementation((key) => {
  switch (key) {
    case 'auth.entra.tenant': return 'test-tenant-id'
    default: return null
  }
})
```

### Transaction Session Mocking

```javascript
const mockSession = {
  withTransaction: vi.fn().mockImplementation(async (callback) => callback()),
  endSession: vi.fn()
}
client.startSession.mockReturnValue(mockSession)
```

### Dynamic Import Pattern (for modules that read config at import time)

```javascript
beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  const module = await import('../../../../src/plugins/auth/create-auth-strategy.js')
  createAuthStrategy = module.createAuthStrategy
})
```

### Fake Timers

```javascript
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: new Date('2026-03-16T12:00:00.000Z') })
})

afterEach(() => {
  vi.useRealTimers()
})
```

## Mock Return Values

```javascript
// Synchronous
formatInboundMetadata.mockReturnValue(formattedDocuments)

// Async – resolved
persistMetadata.mockResolvedValue({ insertedIds: {} })

// Async – rejected
mockSnsClient.send.mockRejectedValue(new Error('SNS service unavailable'))

// Complex logic
mockConfigGet.mockImplementation((key) => { /* switch/if */ })
```

## Assertion Patterns

```javascript
// Called / called with
expect(fn).toHaveBeenCalled()
expect(fn).toHaveBeenCalledTimes(1)
expect(fn).toHaveBeenCalledWith(arg1, arg2)
expect(fn).toHaveBeenCalledWith(payload, expect.any(Error))

// Not called
expect(fn).not.toHaveBeenCalled()

// Equality
expect(result).toBe(expected)           // strict reference/primitive
expect(result).toEqual(expected)        // deep equality
expect(result).toStrictEqual(expected)  // deep + type-strict

// Truthiness / type
expect(result).toBeDefined()
expect(result).toBeNull()
expect(result).toBeUndefined()
expect(result).toBeInstanceOf(Array)

// Collections
expect(array).toHaveLength(2)
expect(result).toHaveProperty('key')
expect(result).toMatchObject({ subset: true })

// Strings / regex
expect(str).toMatch(/^[0-9a-f-]{36}$/i)

// Errors (async)
await expect(fn()).rejects.toThrow('message')

// Partial matchers
expect(fn).toHaveBeenCalledWith(
  expect.objectContaining({ id: 'abc' })
)
expect(fn).toHaveBeenCalledWith(
  expect.arrayContaining([expect.objectContaining({ Id: 'msg-0' })])
)
```

## Test Data

1. **Prefer shared mocks** from `test/mocks/` — check what exists before creating new data.
2. **Use object spread** for per-test variations:
   ```javascript
   const payload = { ...mockScanAndUploadResponse, uploadStatus: 'pending' }
   ```
3. **Use `Array.from`** for dynamic batch data:
   ```javascript
   const largeBatch = Array.from({ length: 25 }, (_, i) => ({
     _id: `id-${i}`,
     status: 'pending'
   }))
   ```

## Hapi Handler Testing

Use the response toolkit mock pattern:

```javascript
const h = {
  response: (body) => ({
    body,
    code: (status) => ({ status, body })
  })
}

const result = await handler({ payload }, h)
expect(result.status).toBe(201)
```

## Lifecycle Hooks

- Always call `vi.clearAllMocks()` in `beforeEach`.
- Use `afterEach` only when cleanup is needed (fake timers, env vars).
- Use `beforeAll`/`afterAll` sparingly — only for expensive setup like env preservation:
  ```javascript
  let originalEnv
  beforeAll(() => { originalEnv = process.env })
  afterEach(() => { process.env = originalEnv })
  ```

## Checklist Before Finishing

- [ ] Uses `test()` not `it()`
- [ ] Imports from `vitest` are explicit (not global)
- [ ] All imports use `.js` extension
- [ ] `vi.clearAllMocks()` in `beforeEach`
- [ ] Reuses mock data from `test/mocks/` where possible
- [ ] Covers happy path, error path, and edge cases
- [ ] No changes to source code to accommodate tests
