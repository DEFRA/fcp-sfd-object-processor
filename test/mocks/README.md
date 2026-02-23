# Test Mock Data

This directory contains reusable mock data for tests, organized by the data flow through the system.

## Architecture

```
INPUT (CDP)          INTERNAL (MongoDB)        OUTPUT (SNS)
     │                      │                       │
     ▼                      ▼                       ▼
cdp-uploader.js ──> metadata.js/outbox.js ──> document-upload-event.js
     │                      │                       │
     └──────────────── base-data.js ────────────────┘
                    (shared building blocks)
```

## Files

### `base-data.js` - Core Building Blocks
Central source of truth for test data. Exports:
- **Base metadata objects** (`baseMetadata`, `alternateMetadata`)
- **Base file uploads** (`baseFileUpload1-4`) 
- **Helper functions** (`createFormattedDocument`, `createFileSubdocument`, etc.)

**When to use:**
- Creating custom test scenarios
- Building new mock variations
- Need atomic data pieces

**Example:**
```javascript
import { baseMetadata, baseFileUpload1, createFormattedDocument } from './base-data.js'

const customDoc = createFormattedDocument(baseMetadata, baseFileUpload1, {
  correlationId: 'my-custom-id'
})
```

---

### `cdp-uploader.js` - CDP Uploader Callbacks (INPUT)
Mock payloads received from CDP Uploader service after file scanning/upload.

**Exports:**
- `mockScanAndUploadResponse` - Standard callback with 2 files + text fields
- `mockScanAndUploadResponseSingleFile` - Callback with 1 file
- `mockScanAndUploadResponseAlt` - Alternative metadata/files

**When to use:**
- Testing callback route (`/api/v1/callback`)
- Testing schema validation
- Testing metadata formatting/persistence

**Example:**
```javascript
import { mockScanAndUploadResponse } from '../mocks/cdp-uploader.js'

const response = await server.inject({
  method: 'POST',
  url: '/api/v1/callback',
  payload: mockScanAndUploadResponse
})
```

---

### `metadata.js` - Formatted Documents (INTERNAL)
Mock documents in internal storage format (how data is stored in MongoDB).

**Exports:**
- `mockMetadataResponse` - Array of 2 formatted documents
- `mockMetadataResponseAlt` - Alternative submission documents
- `mockFormattedMetadata` - Single document (for blob/metadata queries)

**When to use:**
- Testing metadata queries (`/api/v1/metadata/{sbi}`)
- Testing blob queries (`/api/v1/blob/{fileId}`)
- Seeding test database collections
- Testing repos/services that read from MongoDB

**Example:**
```javascript
import { mockMetadataResponse } from '../mocks/metadata.js'

// Seed database
await db.collection('uploadMetadata').insertMany(mockMetadataResponse)

// Query and verify
const docs = await repo.getMetadataBySbi(105000000)
expect(docs).toHaveLength(2)
```

---

### `outbox.js` - Outbox Entries
Mock outbox entries for transactional outbox pattern testing.

**Exports:**
- `mockPendingMessages` - Array of 2 PENDING messages
- `mockPendingMessageOne/Two` - Individual messages

**When to use:**
- Testing outbox processing
- Testing message publishing to SNS
- Testing outbox status updates

**Example:**
```javascript
import { mockPendingMessages } from '../mocks/outbox.js'

await db.collection('outbox').insertMany(mockPendingMessages)
const messages = await repo.getPendingOutboxEntries(10)
```

---

### `messaging/document-upload-event.js` - SNS Messages (OUTPUT)
Mock CloudEvents v1.0 formatted messages sent to SNS.

**Exports:**
- `mockDocumentUploadedEvent` - CloudEvents message

**When to use:**
- Testing message building logic
- Testing SNS publishing
- Verifying CloudEvents compliance

**Example:**
```javascript
import { mockDocumentUploadedEvent } from '../mocks/messaging/document-upload-event.js'

const event = buildDocumentUploadEvent(metadata)
expect(event).toMatchObject(mockDocumentUploadedEvent)
```

## Data Consistency

All mocks use consistent data from `base-data.js`:

| Mock File | Metadata | File Uploads |
|-----------|----------|--------------|
| cdp-uploader.js | `baseMetadata` | `baseFileUpload1`, `baseFileUpload2` |
| metadata.js | `baseMetadata` | `baseFileUpload1`, `baseFileUpload2` |
| outbox.js | `baseMetadata`, `alternateMetadata` | `baseFileUpload3`, `baseFileUpload4` |

**Key IDs:**
- SBI: `105000000` (primary), `205000000` (alternate)
- CRN: `1050000000` (primary), `2050000000` (alternate)
- File IDs: See `baseFileUpload1-4` in base-data.js
- Correlation IDs: Auto-generated or specify via helpers

## Best Practices

### ✅ DO:
```javascript
// Use existing mocks for common scenarios
import { mockScanAndUploadResponse } from '../mocks/cdp-uploader.js'

// Use helpers for custom variations
import { baseMetadata, baseFileUpload1, createFormattedDocument } from '../mocks/base-data.js'
const customDoc = createFormattedDocument(baseMetadata, baseFileUpload1)

// Use unique collection names in integration tests
config.set('mongo.collections.uploadMetadata', 'my-test-collection')
```

### ❌ DON'T:
```javascript
// Don't hardcode test data inline
const payload = {
  metadata: { sbi: 105000000, crn: 1050000000, ... }, // ❌ Duplicates base-data.js
  form: { ... }
}

// Don't modify shared mocks directly
mockMetadataResponse[0].metadata.sbi = 999999999 // ❌ Affects other tests

// Don't create new metadata objects without considering base-data.js
const anotherMetadata = { sbi: 12345, ... } // ❌ Prefer extending base-data.js
```

## Extending Mocks

Need new test data? Follow this pattern:

1. **Add to `base-data.js`** if it's reusable:
   ```javascript
   export const baseFileUpload5 = { ... }
   ```

2. **Create domain-specific variations** in relevant files:
   ```javascript
   // In cdp-uploader.js
   export const mockScanAndUploadWithRejectedFiles = {
     ...mockScanAndUploadResponse,
     numberOfRejectedFiles: 3
   }
   ```

3. **Document in this README** so others know it exists

## Migration Notes

**Old → New:**
- `mockFormField` → Use `baseFileUpload1` from base-data.js
- `mockMetadata` → Use `baseMetadata` from base-data.js  
- `mockScanAndUploadResponseArray` → Deprecated, create specific tests instead
- Inline test data → Import from these mock files
