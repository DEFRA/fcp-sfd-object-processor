# fcp-sfd-object-processor — Developer Deep-Dive
## Session 1: Basics & API Endpoints

---

## 1. What Is This Service?

`fcp-sfd-object-processor` is a **messaging gateway** for the **Single Front Door (SFD)** programme. Its role in the overall system:

```
Browser / Frontend App
        │
        ▼
  CDP Uploader ──────────────────────────────────────────────┐
  (file scanning,                                            │  callback (POST /api/v1/callback)
   virus check, S3 upload)                                   ▼
                                              fcp-sfd-object-processor
                                              ┌────────────────────────┐
                                              │  • Validate payload    │
                                              │  • Persist metadata    │──► MongoDB
                                              │  • Create outbox entry │──► MongoDB (outbox)
                                              │  • Publish to SNS      │──► AWS SNS
                                              └────────────────────────┘
                                                          │
                                                          ▼
                                                    CRM Service
                                              (creates cases/attachments)
```

**In plain English:**
1. A user uploads files via a frontend service.
2. The CDP Uploader scans and stores the files in S3.
3. CDP Uploader calls *our* service back with metadata about the upload.
4. We persist that metadata and queue an event for the CRM system.

---

## 2. Architecture Overview

### Layered Architecture

```
┌─────────────────────────────────┐
│          API Layer              │  src/api/  — Hapi.js routes, handlers, Joi schemas
├─────────────────────────────────┤
│        Service Layer            │  src/services/  — business logic, orchestrates repos, manages transactions
├─────────────────────────────────┤
│       Repository Layer          │  src/repos/  — database & S3 operations, accept `session` param
├─────────────────────────────────┤
│         Data Layer              │  src/data/  — MongoDB client
└─────────────────────────────────┘
```

**Rules to remember:**
- API handlers call **services**, never repos directly.
- Services coordinate **MongoDB transactions** and call multiple repos.
- Repos accept an optional `session` parameter for transactions.
- Never write database queries in API handlers.

### Technology Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js v22+ with ES Modules (`type: "module"`) |
| API Framework | Hapi.js |
| API Docs | hapi-swagger → OpenAPI at `/documentation` |
| Database | MongoDB (replica set required for transactions) |
| Validation | Joi schemas |
| Messaging | AWS SNS (v3 SDK) |
| File Storage | AWS S3 (v3 SDK) |
| Testing | Vitest |
| Linting | neostandard (ESLint) |
| Local AWS | LocalStack at `http://localstack:4566` |

### Project Structure (key directories)

```
src/
  api/          # Routes, handlers, Joi schemas
    v1/
      callback/     # POST /api/v1/callback
      blobs/        # GET  /api/v1/blob/{fileId}
      metadata/     # GET  /api/v1/metadata/sbi/{sbi}
      status/       # GET  /api/v1/status/{correlationId}
      uploader/
        initiate/   # POST /api/v1/uploader/initiate
        status/     # GET  /api/v1/uploader/status/{uploadId}
  services/     # metadata-service.js — outbox transaction orchestration
  repos/        # metadata.js, outbox.js, s3.js, status.js
  messaging/    # Outbound SNS publisher (outbox processor)
  plugins/      # Hapi plugins — auth (Entra + Cognito)
  config/       # convict-based config
  constants/    # outbox statuses, mime types, auth strategy names
  logging/      # ECS-format structured logger
```

---

## 3. Authentication & Authorisation

### Two Supported Token Types

The service supports **two JWT strategies** which can be enabled independently:

| Strategy | Provider | Enable via |
|---|---|---|
| `entra-{tenantId}` | Microsoft Entra ID (Azure AD) | `AUTH_ENTRA_ENABLED=true` |
| `cognito` | AWS Cognito | `AUTH_COGNITO_ENABLED=true` |

Both are disabled by default (`false`) to simplify local development.

### How It Works

When one or both strategies are enabled, **all routes require authentication** unless explicitly opted out:

```javascript
// Disabling auth on a specific route
options: {
  auth: false  // public route — no token required
}
```

Currently, two routes have `auth: false`:
- `GET /health` — health check (must be publicly accessible)
- `POST /api/v1/callback` — called by CDP Uploader which cannot present a token

### Token Validation Steps (Entra)

1. Verify token signature against Azure AD public keys (JWKS endpoint).
2. Check token type is `JWT` or `at+jwt`.
3. Validate `exp` (expiry), `nbf` (not-before), and `iss` (issuer).
4. Ensure the token contains at least one matching security group from `AUTH_ALLOWED_GROUP_IDS`.
5. Log authentication failures with request context (path, method, IP, user-agent, token groups).

### Getting a Token for Testing

**Option A — Cognito (via helper script):**
```bash
VALID_AUTH_TOKEN=$(./get-cognito-token.sh \
  YOUR_COGNITO_CLIENT_ID \
  YOUR_COGNITO_CLIENT_SECRET \
  dev)
```

**Option B — Entra (Azure AD):**
```bash
VALID_AUTH_TOKEN=$(curl -s -X POST \
  "https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=YOUR_ENTRA_CLIENT_ID" \
  -d "client_secret=YOUR_ENTRA_CLIENT_SECRET" \
  -d "scope=YOUR_ENTRA_CLIENT_ID/.default" \
  -d "grant_type=client_credentials" | jq -r '.access_token')
```

Once you have a token, pass it as a Bearer header:
```bash
-H "Authorization: Bearer ${VALID_AUTH_TOKEN}"
```

---

## 4. API Endpoints Walkthrough

> **Environment config:** Set `ENV` to `dev | test | perf-test | ext-test | prod` to derive `BASE_URL` automatically.
>
> **Swagger UI:** Available at `{BASE_URL}/documentation` when running locally.

---

### 4.1 `GET /health`

**Purpose:** Kubernetes liveness/readiness probe. No auth required.

```bash
curl -s https://fcp-sfd-object-processor.dev.cdp-int.defra.cloud/health | jq
```

**Response:**
```json
{ "message": "success" }
```

---

### 4.2 `POST /api/v1/callback`

**Purpose:** Receives file upload completion notifications from CDP Uploader.

**Auth:** None (`auth: false`) — CDP Uploader cannot authenticate.

**Validation (3 stages):**
1. **Joi schema** — structural shape of the payload (required fields, types).
2. **Contract validation** — `uploadStatus` must be `"ready"`; all files must be `"complete"`.
3. **Semantic validation** — file-level consistency checks (checksums, error fields).

```bash
curl -s -X POST "${BASE_URL}/callback" \
  -H "Content-Type: application/json" \
  -d '{
  "uploadStatus": "ready",
  "metadata": {
    "sbi": 105000000,
    "crn": 1050000000,
    "frn": 1102658375,
    "submissionId": "1733826312",
    "uosr": "107220150_1733826312",
    "submissionDateTime": "10/12/2024 10:25:12",
    "files": ["107220150_1733826312_SBI107220150.pdf"],
    "filesInSubmission": 1,
    "type": "CS_Agreement_Evidence",
    "reference": "manual-test",
    "service": "fcp-sfd-frontend"
  },
  "form": {
    "file-upload-1": {
      "fileId": "00000000-0000-0000-0000-000000000000",
      "filename": "test-document.pdf",
      "contentType": "application/pdf",
      "fileStatus": "complete",
      "contentLength": 11264,
      "checksumSha256": "example-value-1",
      "detectedContentType": "application/pdf",
      "s3Key": "00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000001",
      "s3Bucket": "dev-fcp-sfd-object-processor-bucket-c63f2"
    }
  },
  "numberOfRejectedFiles": 0
}' | jq
```

**Success response (201 Created):**
```json
{
  "message": "Metadata created",
  "count": 1,
  "ids": ["not-real-id"]
}
```

**Key points:**
- The `form` can contain text fields as well as file uploads; only objects with a `fileId` are processed.
- All files in the same callback share the same `correlationId` (generated at processing time).
- Validation failures still return `201` and persist a failure status record (for audit purposes).

---

### 4.3 `GET /api/v1/metadata/sbi/{sbi}`

**Purpose:** Retrieve file metadata records for a given SBI (Single Business Identifier).

**Auth:** Required.

> ⚠️ SBIs are stored as **integers** in the database. The URL parameter is converted from string to int automatically. Do not pass a non-numeric SBI.

```bash
curl -s -X GET "${BASE_URL}/metadata/sbi/105000000" \
  -H "Authorization: Bearer ${VALID_AUTH_TOKEN}" | jq
```

**Success response (200 OK):**
```json
{
  "data": [
    {
      "_id": "60b8d295f1d2c916c8a5e9b7",
      "metadata": { "sbi": 105000000, "crn": 1050000000, "type": "CS_Agreement_Evidence", ... },
      "file": { "fileId": "...", "filename": "test.pdf", "contentType": "application/pdf", "fileStatus": "complete" }
    }
  ]
}
```

---

### 4.4 `GET /api/v1/blob/{fileId}`

**Purpose:** Generates a **pre-signed S3 URL** for direct file download.

**Auth:** Required.

```bash
curl -s -X GET "${BASE_URL}/blob/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer ${VALID_AUTH_TOKEN}" | jq
```

**Success response (200 OK):**
```json
{
  "data": {
    "url": "https://s3.eu-west-2.amazonaws.com/dev-bucket/...?X-Amz-Signature=..."
  }
}
```

> The pre-signed URL has a time-limited expiry. Use it promptly after receiving it.

---

### 4.5 `GET /api/v1/status/{correlationId}`

**Purpose:** Returns the processing status records for a given `correlationId`.

**Auth:** Required.

A `correlationId` is generated when a callback is processed and groups all files from the same submission. It can be found in the callback response's metadata.

```bash
curl -s -X GET "${BASE_URL}/status/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
  -H "Authorization: Bearer ${VALID_AUTH_TOKEN}" | jq
```

**Success response (200 OK):**
```json
{
  "data": [
    {
      "correlationId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "fileId": "...",
      "status": "VALIDATED",
      ...
    }
  ]
}
```

---

### 4.6 `POST /api/v1/uploader/initiate`

**Purpose:** Initiates a new upload session with CDP Uploader. The frontend calls this before directing the user to upload files.

**Auth:** Required.

**What it does:**
1. Accepts client payload with `redirect` URL and submission `metadata`.
2. Enriches it with server-side config (S3 bucket, callback URL, allowed MIME types, max file size).
3. Proxies the enriched request to CDP Uploader's `/initiate` endpoint.
4. Rewrites the response URLs to point back through this service.

```bash
curl -X POST "${BASE_URL}/uploader/initiate" \
  -H "Authorization: Bearer ${VALID_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
  "redirect": "/next-page",
  "metadata": {
    "sbi": 105000000,
    "crn": 1050000000,
    "frn": 1102658375,
    "submissionId": "1733826312",
    "uosr": "107220150_1733826312",
    "type": "CS_Agreement_Evidence",
    "reference": "manual-test",
    "service": "fcp-sfd-frontend"
  }
}' | jq
```

**Success response (200 OK):**
```json
{
  "data": {
    "uploadId": "abc123",
    "uploadUrl": "https://cdp-uploader.dev.cdp-int.defra.cloud/upload-and-scan/abc123",
    "statusUrl": "https://fcp-sfd-object-processor.dev.cdp-int.defra.cloud/api/v1/uploader/status/abc123"
  }
}
```

> Save the `uploadId` — you'll need it for the next two steps.

---

### 4.7 `GET /api/v1/uploader/status/{uploadId}`

**Purpose:** Polls CDP Uploader for the current scan status of an upload session.

**Auth:** Required.

```bash
curl -s -X GET "${BASE_URL}/uploader/status/abc123" \
  -H "Authorization: Bearer ${VALID_AUTH_TOKEN}" | jq
```

**Status mapping:**

| CDP Uploader `uploadStatus` | `numberOfRejectedFiles` | This service returns |
|---|---|---|
| `"ready"` | `0` | `"success"` |
| `"ready"` | `> 0` | `"failure"` |
| anything else | any | `"pending"` |

**Success response (200 OK):**
```json
{
  "data": {
    "uploadStatus": "success",
    "form": { ... },
    "metadata": { ... }
  }
}
```

---

## 5. End-to-End Data Flow

```
1. Frontend calls POST /uploader/initiate
         │
         ▼
2. Service proxies to CDP Uploader → returns uploadId + upload URL
         │
         ▼
3. User (or script) POSTs file to CDP Uploader upload-and-scan/{uploadId}
         │  (CDP Uploader: scans file, uploads to S3)
         ▼
4. CDP Uploader calls POST /api/v1/callback (no auth)
         │
         ├─ Stage 1: Joi schema validation
         ├─ Stage 2: Contract validation (status=ready, all files complete)
         ├─ Stage 3: Semantic validation (checksums, error fields)
         │
         ▼
5. persistMetadataWithOutbox()  ← MongoDB TRANSACTION
         ├─ formatInboundMetadata() — strips text fields, assigns correlationId
         ├─ insertMany → uploadMetadata collection
         └─ createOutboxEntries → outbox collection (PENDING)
         │
         ▼
6. Response 201 → { message, count, ids }
         │
         ▼
7. Background outbox loop polls PENDING entries
         │
         ├─ Builds CloudEvents messages
         ├─ Publishes batch to SNS
         └─ Updates outbox PENDING → SENT + sets metadata.messaging.publishedAt
         │
         ▼
8. CRM service consumes SNS event → creates case + attachment record
```

---

## 6. Best Practices

### ESM Module Imports
Always include `.js` extensions in imports:
```javascript
import { foo } from './bar.js'   // ✅ correct
import { foo } from './bar'      // ❌ will break
```

### Error Handling with Boom
Use `@hapi/boom` for HTTP errors in handlers:
```javascript
import Boom from '@hapi/boom'

// 404
throw Boom.notFound('No documents found')

// 500
throw Boom.internal(err)

// 502
throw Boom.badGateway('CDP Uploader returned non-2xx response')
```

### Structured Logging (ECS Format)
All structured fields **must** be nested under `event`:
```javascript
logger.info({
  event: {
    type: 'callback_received',
    reference: uploadId,
    outcome: 'success'
  }
}, 'Callback processed')
```
> ⚠️ Flat top-level fields are not visible on the platform.

### Configuration Access
```javascript
import { config } from '../config/index.js'

const value = config.get('mongo.collections.uploadMetadata')
```

### Writing Tests
- Use **Vitest** (not Jest) — `vi.fn()`, `vi.mock()`, `describe`, `it`, `expect`.
- **Never mock the `mongodb` package directly** — mock `src/data/db.js` instead.
- Integration tests: use `server.inject()` and unique collection names per test suite.

---

## 7. Running the Service Locally

```bash
# Full stack (recommended — uses fcp-sfd-core)
docker compose up --build

# With debug port exposed (9229)
npm run docker:debug

# Run tests
npm run docker:test

# Watch mode tests
npm run docker:test:watch
```

> See `compose.yaml` and related compose files for all environment variables.

---

*Next: [Session 2 — The Outbox Pattern](./op-deepdive-2.md)*
