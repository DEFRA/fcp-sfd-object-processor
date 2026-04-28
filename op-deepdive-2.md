# fcp-sfd-object-processor — Developer Deep-Dive
## Session 2: The Transactional Outbox Pattern & Authentication

---

## 1. The Problem: Dual-Write Reliability

When a service needs to **both save data to a database and publish an event**, a naive approach creates a reliability gap:

```
Option A — DB write first:
  ┌──────────┐              ┌──────────┐
  │  Save    │──── OK ─────►│  Publish │──── CRASH 💥
  │ metadata │              │  to SNS  │
  └──────────┘              └──────────┘
  Data saved, but event never published → CRM never creates a case.

Option B — Publish first:
  ┌──────────┐              ┌──────────┐
  │  Publish │──── OK ─────►│  Save    │──── CRASH 💥
  │  to SNS  │              │ metadata │
  └──────────┘              └──────────┘
  Event published, but data never saved → inconsistency.
```

**The outbox pattern solves this** by:
1. Writing the data **and** the event intent to the database in a single atomic transaction.
2. A separate background process reliably publishes the event from the database.

If the service crashes after step 1, the event is picked up and published on the next startup. No messages are lost.

---

## 2. High-Level Architecture

```
 ┌────────────────────────────────────────────────────────────────────┐
 │                        MongoDB                                     │
 │  ┌─────────────────────┐        ┌───────────────────────────────┐  │
 │  │   uploadMetadata    │        │           outbox              │  │
 │  │                     │        │                               │  │
 │  │  _id, raw, metadata │        │  messageId   → _id of        │  │
 │  │  file, s3,          │        │                uploadMetadata │  │
 │  │  messaging          │        │  payload     → full document  │  │
 │  │    .publishedAt     │        │  status      → PENDING        │  │
 │  │    .correlationId   │        │  attempts    → 0              │  │
 │  └─────────────────────┘        └───────────────────────────────┘  │
 └───────────────────────────────────────────┬────────────────────────┘
                        ▲                    │
          ATOMIC        │                    │ Background loop polls
          TRANSACTION   │                    ▼
                        │          ┌─────────────────────┐
  POST /callback ───────┘          │  Outbox Processor   │
  (writes both                     │  publishPending      │
   collections)                    │  Messages()          │
                                   └──────────┬──────────┘
                                              │
                                              ▼
                                        AWS SNS Topic
                                   (documentUploadEvents)
                                              │
                                              ▼
                                       CRM Service
```

---

## 3. The Write Path (Inbound)

When a callback arrives, `persistMetadataWithOutbox()` in `src/services/metadata-service.js` orchestrates everything inside a single MongoDB transaction:

```javascript
// src/services/metadata-service.js
const persistMetadataWithOutbox = async (rawDocuments) => {
  const session = client.startSession()

  try {
    return await session.withTransaction(async () => {
      // 1. Format the raw CDP Uploader payload into structured documents
      const documents = formatInboundMetadata(rawDocuments)

      // 2. Build status documents (for audit trail)
      const statusDocuments = buildValidatedStatusDocuments(documents)

      // 3. Insert status records
      await insertStatus(statusDocuments, session)

      // 4. Insert metadata documents
      const metadataResult = await persistMetadata(documents, session)

      // 5. Insert outbox entries (linked to metadata by insertedIds)
      await createOutboxEntries(metadataResult.insertedIds, documents, session)

      return metadataResult
    })
    // If any step throws, MongoDB automatically rolls back all writes.
  } catch (error) {
    logger.error(error, 'Failed to persist metadata with outbox')
    throw error
  } finally {
    await session.endSession()   // Always release the session
  }
}
```

### What `formatInboundMetadata()` Does

The raw CDP Uploader payload mixes text form fields with file objects. `formatInboundMetadata()` cleans this up:

```javascript
// Filters out text fields — only keeps objects that have a `fileId`
const filteredFormData = formData.filter(
  data => typeof data === 'object' && data?.fileId
)

// All files from the same callback share a single correlationId
const correlationId = randomUUID()

return filteredFormData.map((formUpload) => ({
  raw:      { uploadStatus, numberOfRejectedFiles, ...formUpload },
  metadata: metadata,                          // sbi, crn, type, service, etc.
  file:     { fileId, filename, contentType, fileStatus },
  s3:       { key: s3Key, bucket: s3Bucket },
  messaging: {
    publishedAt: null,       // Set later by the outbox processor
    correlationId            // UUID grouping files from this upload
  }
}))
```

### What `createOutboxEntries()` Does

```javascript
// src/repos/outbox.js
const createOutboxEntries = async (ids, documents, session) => {
  // Only create outbox entries for 'complete' files
  const outboxDocsToInsert = Object.entries(ids)
    .filter(([index]) => documents[index].file.fileStatus === 'complete')
    .map(([index, id]) => ({
      messageId: id,         // Links back to uploadMetadata _id
      payload:   documents[index],
      status:    PENDING,    // Initial status
      attempts:  0,
      createdAt: new Date()
    }))

  await db.collection(collection).insertMany(outboxDocsToInsert, { session })
}
```

> **Key insight:** Files that are not `complete` (e.g. rejected or errored) do **not** get outbox entries. They won't be published to SNS.

---

## 4. The Outbox Status Lifecycle

```
               ┌─────────────────────────────────────────┐
               │                                         │
  Created ──► PENDING ──────── SNS publish OK ─────► SENT
                 │                                       ▲
                 └─── SNS publish FAILED ─────► FAILED ──┘
                                                  │
                                                  └── picked up on next poll cycle
```

| Status | Meaning |
|---|---|
| `PENDING` | Created; not yet published to SNS |
| `SENT` | Successfully published; `messaging.publishedAt` set in metadata |
| `FAILED` | Last publish attempt failed; will be retried on next poll |

Constants are defined in `src/constants/outbox.js`:
```javascript
export const PENDING   = 'PENDING'
export const SENT      = 'SENT'
export const FAILED    = 'FAILED'
export const BATCH_SIZE = 10
```

---

## 5. The Read/Publish Path (Outbound)

The background loop starts when the service boots and runs indefinitely:

```javascript
// src/messaging/outbound/index.js
const startOutbox = async () => {
  try {
    await publishPendingMessages()
  } catch (error) {
    throw new Error(`Outbox processing failed: ${error.message}`, error)
  } finally {
    // Schedule the next run regardless of success or failure
    setTimeout(startOutbox, config.get('messaging.outboxIntervalMs'))
  }
}
```

### Step-by-step: `publishPendingMessages()`

```javascript
// src/messaging/outbound/crm/doc-upload/publish-pending-messages.js

const publishPendingMessages = async () => {
  const session = client.startSession()

  try {
    // 1. Fetch PENDING and FAILED entries (up to outboxQueryLimit)
    const pendingMessages = await getProcessableOutboxEntries()

    if (!pendingMessages.length) {
      logger.info('No pending outbox messages to process.')
      return
    }

    // 2. Process in batches of BATCH_SIZE (10)
    for (let i = 0; i < pendingMessages.length; i += BATCH_SIZE) {
      const batch = pendingMessages.slice(i, i + BATCH_SIZE)

      // 3. Build CloudEvents messages and publish to SNS
      const { Successful, Failed } = await publishDocumentUploadMessageBatch(batch)

      // 4. Update statuses in a transaction
      await session.withTransaction(async () => {
        if (Successful.length > 0) {
          await bulkUpdateDeliveryStatus(session, messageIds, SENT)
          await bulkUpdatePublishedAtDate(session, messageIds)  // sets messaging.publishedAt
        }
        if (Failed.length > 0) {
          await bulkUpdateDeliveryStatus(session, failedIds, FAILED, 'Failed to send message')
        }
      })
    }
  } finally {
    await session.endSession()
  }
}
```

### Querying Processable Entries

```javascript
// src/repos/outbox.js
const getProcessableOutboxEntries = async () => {
  return db.collection(collection)
    .find({ status: { $in: [PENDING, FAILED] } })  // Both statuses are retried
    .limit(queryLimit)
    .toArray()
}
```

---

## 6. SNS Message Format (CloudEvents v1.0)

Messages are structured according to the **CloudEvents v1.0 specification**. The contract is defined in `docs/asyncapi/v1.yaml`.

```javascript
// Built in: src/messaging/outbound/crm/doc-upload/build-document-upload-message-batch.js
{
  id:              file.fileId,      // UUID — used for idempotency in downstream
  source:          'fcp-sfd-object-processor',
  specversion:     '1.0',
  type:            'uk.gov.fcp.sfd.document.uploaded',
  datacontenttype: 'application/json',
  time:            '2026-02-16T10:00:00.000Z',
  data: {
    crn:           1050000000,
    crm: {
      caseType: 'CS_Agreement_Evidence',
      title:    'manual-test - CRN 1050000000 - 16/02/2026'
    },
    correlationId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    file: {
      fileId:      'xxxxxxxx-...',
      fileName:    'test-document.pdf',
      contentType: 'application/pdf',
      url:         'https://fcp-sfd-object-processor.dev.cdp-int.defra.cloud/api/v1/blobs/{fileId}'
    },
    sbi:          105000000,
    sourceSystem: 'fcp-sfd-frontend',
    submissionId: '1733826312'
  }
}
```

### Key Fields Explained

| Field | Purpose |
|---|---|
| `id` | Set to `fileId` — allows CRM to deduplicate if the same message is received twice |
| `type` | CloudEvents event type — identifies the event to consumers |
| `data.crm.caseType` | Maps to CRM queue name (e.g. `CS_Agreement_Evidence`) |
| `data.crm.title` | Human-readable case title built from reference, CRN, and date |
| `data.correlationId` | Groups all files from the same submission |
| `data.file.url` | Points back to our `/blob/{fileId}` endpoint for the pre-signed download URL |
| `data.sourceSystem` | Identifies origin (`fcp-sfd-frontend`, `rps-portal`, etc.) |

---

## 7. CRM Integration

The downstream CRM service consumes the SNS events to:
1. Create a support case of type `caseType`.
2. Attach the file using the `url` field (which hits our `/blob/{fileId}` endpoint).
3. Use `submissionId` and `crn` to associate the case with a customer.
4. Use `fileId` for idempotency — processing the same message twice should not create duplicate cases.

```
SNS Topic: documentUploadEvents
        │
        ▼
  CRM Service ──► creates case ──► attaches file via /api/v1/blob/{fileId}
```

---

## 8. MongoDB Transactions: Key Points

The outbox pattern **requires** MongoDB replica sets because transactions are not supported on standalone instances.

### Golden Rules

```javascript
// ✅ Always start a session
const session = client.startSession()

try {
  await session.withTransaction(async () => {
    // All DB operations inside use { session }
    await collection.insertMany(docs, { session })
    await collection.updateMany(filter, update, { session })
    // If anything throws, withTransaction() automatically rolls back
  })
} catch (error) {
  // Handle error
} finally {
  // ✅ ALWAYS end the session — even if the transaction failed
  await session.endSession()
}
```

### Why `withTransaction()`?

`session.withTransaction()` provides automatic:
- **Commit** on success.
- **Rollback** on any error thrown inside the callback.
- **Retry** on transient transaction errors (e.g. write conflicts).

Without it, you'd need to manually call `session.commitTransaction()` and `session.abortTransaction()`.

---

## 9. Failure Modes & Resilience

| Scenario | What happens |
|---|---|
| Service crashes after DB write but before SNS | Outbox entry remains `PENDING`; published on next restart |
| SNS returns a failure for one message | That message marked `FAILED`; retried on next poll cycle |
| SNS returns a partial batch failure | Successful messages marked `SENT`; failed ones marked `FAILED` |
| MongoDB transaction fails | Nothing written to either collection (atomic rollback) |
| Outbox processor throws an exception | Caught, logged, and `setTimeout` still schedules the next run |

---

## 10. Configuration for the Outbox

Relevant config keys (see `compose.yaml` for actual values):

| Key | Purpose |
|---|---|
| `messaging.outboxIntervalMs` | How often to poll (milliseconds) |
| `mongo.outboxQueryLimit` | Max entries fetched per poll cycle |
| `aws.messaging.topics.documentUploadEvents` | SNS topic ARN |
| `BATCH_SIZE` (constant) | Max messages per SNS `PublishBatch` call (hard-coded: 10) |

---

## 11. Code Map: Outbox Files

```
src/
  services/
    metadata-service.js         ← orchestrates the write transaction

  repos/
    outbox.js                   ← createOutboxEntries, getProcessableOutboxEntries,
                                   bulkUpdateDeliveryStatus
    metadata.js                 ← bulkUpdatePublishedAtDate, formatInboundMetadata

  messaging/
    outbound/
      index.js                  ← startOutbox() background loop
      crm/doc-upload/
        publish-pending-messages.js          ← main poll → publish → update flow
        publish-document-upload-message-batch.js   ← wraps SNS publish
        build-document-upload-message-batch.js     ← builds CloudEvents message shape

  constants/
    outbox.js                   ← PENDING, SENT, FAILED, BATCH_SIZE

  data/
    db.js                       ← exports `db` (collection accessor) and `client` (for sessions)
```

---

## 12. Checklist for New Outbox Features

If you're adding a new type of event to the outbox:

- [ ] Define new constants in `src/constants/outbox.js` if needed.
- [ ] Create a new message builder (`build-*.js`) following CloudEvents spec.
- [ ] Create a new publisher (`publish-*.js`) that calls the SNS client.
- [ ] Create a new `publish-pending-*.js` that queries the outbox and invokes the publisher.
- [ ] Register the new publisher in `src/messaging/outbound/index.js`.
- [ ] Add unit tests for the message builder.
- [ ] Add integration tests with unique collection names.

---

## 13. Authentication Deep-Dive

Session 1 introduced authentication at a user level ("how do I get a token?"). This section goes deeper into **how authentication is implemented inside the service** — useful when adding new routes, debugging 401 errors, or rotating credentials.

### 13.1 Where Auth Lives

```
src/
  plugins/
    auth/
      index.js                 ← Hapi plugin — registers strategies + default + failure logging
      create-auth-strategy.js  ← Factory — shared validate() logic for all strategies
      entra-options.js         ← Builds Entra-specific JWT strategy options
      cognito-options.js       ← Builds Cognito-specific JWT strategy options
  constants/
    auth.js                    ← VALID_TOKEN_TYPES, AUTH_STRATEGY_NAMES
  config/
    auth.js                    ← Convict config schema for both strategies
    formats/
      entra-tenants-array.js   ← Custom format validator — parses AUTH_ENTRA_TENANTS JSON
      cognito-client-ids.js    ← Custom format validator — parses AUTH_COGNITO_CLIENT_IDS CSV
  utils/
    build-auth-failure-log.js  ← Structured log builder for auth failures
```

The auth plugin is registered in `src/api/index.js` **after** `@hapi/jwt`.

---

### 13.2 Two Strategies, One Factory

Both Entra and Cognito strategies are built by the same `createAuthStrategy()` factory. This keeps the validation logic DRY and consistent — the only differences are the JWKS endpoint URI, issuer values, and the `checkAllowed` function.

```
createAuthStrategy({
  strategyName,      ← used in logs (e.g. 'entra-abc-tenant-id', 'cognito')
  jwksUri,           ← where to fetch the provider's public keys
  verify,            ← what @hapi/jwt checks automatically (iss, nbf, exp, etc.)
  getAllowedList,     ← returns the list of permitted values (groups or client IDs)
  checkAllowed,      ← inspects the token payload against the allowed list
  emptyListMessage,  ← error when no allowed values are configured
  unauthorisedMessage ← error when token is not in the allowed list
})
```

---

### 13.3 Entra ID (Azure AD) Strategy

**How it's configured:**

```bash
AUTH_ENTRA_ENABLED=true
AUTH_ENTRA_TENANTS='[
  {"tenantId":"defra-dev-tenant-id","allowedGroupIds":["uuid-group-a"]},
  {"tenantId":"defra-prod-tenant-id","allowedGroupIds":["uuid-group-b"]}
]'
```

Each tenant in `AUTH_ENTRA_TENANTS` becomes a **separate Hapi strategy** named `entra-{tenantId}`. This supports multi-tenant deployments where different environments use different Azure AD tenants.

**JWKS endpoint (per tenant):**
```
https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys
```

**Valid issuers (both v1.0 and v2.0 tokens are accepted):**
```
https://sts.windows.net/{tenantId}/
https://login.microsoftonline.com/{tenantId}/v2.0
```

**Authorisation check — security groups:**
The `checkAllowed` function extracts the `groups` claim from the decoded token payload and checks whether at least one group UUID matches the configured `allowedGroupIds`:

```javascript
checkAllowed: (payload, allowedGroupIds) => {
  const tokenGroups = Array.isArray(payload.groups) ? payload.groups : []
  const allowedSet = new Set(allowedGroupIds)
  const allowed = tokenGroups.some(group => allowedSet.has(group))
  return { allowed, failureContext: { tokenGroups, requiredGroups: allowedGroupIds } }
}
```

> The token must contain **at least one** group from the allowed list — not all of them.

---

### 13.4 Cognito Strategy

**How it's configured:**

```bash
AUTH_COGNITO_ENABLED=true
AUTH_COGNITO_USER_POOL_ID=eu-west-2_AbcDefGhi
AUTH_COGNITO_CLIENT_IDS=clientid1,clientid2
AUTH_COGNITO_TOKEN_URL=https://my-pool.auth.eu-west-2.amazoncognito.com/oauth2/token
```

The region is derived automatically from the user pool ID (the prefix before `_`):

```javascript
const region = userPoolId.split('_')[0]  // e.g. 'eu-west-2'
const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
```

**JWKS endpoint:**
```
https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json
```

**Authorisation check — client IDs:**
Unlike Entra (which uses `aud`), Cognito machine-to-machine tokens use a `client_id` claim:

```javascript
checkAllowed: (payload, clientIds) => {
  const tokenClientId = payload.client_id
  const allowed = Boolean(tokenClientId && clientIds.includes(tokenClientId))
  return { allowed, failureContext: { clientId: tokenClientId, issuer: payload.iss } }
}
```

> Cognito client IDs are alphanumeric strings (typically 26 characters), configured as a comma-separated list in `AUTH_COGNITO_CLIENT_IDS`.

---

### 13.5 Shared Token Validation Steps

Every incoming JWT goes through these checks **in order**, regardless of which strategy handles it:

```
1. @hapi/jwt fetches public keys from JWKS endpoint
           │
           ▼
2. @hapi/jwt verifies signature
           │
           ▼
3. @hapi/jwt checks: exp (not expired), nbf (not before), iss (issuer matches)
           │
           ▼
4. validate() checks token type (typ claim must be 'JWT' or 'at+jwt')
   ── fail ──► 401, "Provided token is not an access token"
           │
           ▼
5. validate() checks allowed list is non-empty
   ── fail ──► 401, "No authorized [groups/client IDs] configured"
           │
           ▼
6. validate() runs checkAllowed() — groups (Entra) or client_id (Cognito)
   ── fail ──► 401, "Token does not belong to an authorized Security Group"
               or "Token client_id is not in the list of authorized Cognito client IDs"
           │
           ▼
7. Returns { isValid: true, credentials: { token: payload, principalId: sub } }
```

---

### 13.6 Multi-Strategy Fallback

When **both** Entra and Cognito are enabled, Hapi tries them in registration order. The first strategy to return `isValid: true` wins:

```javascript
// src/plugins/auth/index.js
server.auth.default(
  strategies.length === 1
    ? strategies[0]
    : { strategies }      // Hapi tries each in array order; first success wins
)
```

This means a single request carrying a Cognito token will fail Entra validation (wrong issuer), but Hapi will automatically try the Cognito strategy before rejecting the request.

---

### 13.7 Authentication Failure Logging

Two places log auth failures, giving full visibility:

**Inside `validate()` (application-level rejections — wrong groups, bad token type):**
```javascript
logger.warn(buildAuthFailureLog(reason, request, {
  tokenType,    // or tokenGroups / clientId depending on strategy
  issuer,
  strategy: strategyName
}))
```

**In the `onPreResponse` extension (framework-level rejections — missing/malformed token):**
```javascript
logger.warn({
  msg: 'Authentication failed',
  reason: response.message,
  path: request.path,
  method: request.method,
  sourceIp: request.info.remoteAddress,
  userAgent: request.headers['user-agent'],
  tokenGroups: request.auth?.artifacts?.decoded?.payload?.groups,
  tokenClientId: request.auth?.artifacts?.decoded?.payload?.client_id
})
```

> Both log at `warn` level, not `error` — a rejected token is an expected operational event, not a service fault.

---

### 13.8 Disabling Auth on a Route

For routes that must be publicly accessible, set `auth: false` in the route options:

```javascript
export const myPublicRoute = {
  method: 'GET',
  path: '/api/v1/my-route',
  options: {
    auth: false,  // No token required — document the reason in a comment
    handler: async (request, h) => { ... }
  }
}
```

Current public routes:

| Route | Reason |
|---|---|
| `GET /health` | Must be reachable by the platform without credentials |
| `POST /api/v1/callback` | Called by CDP Uploader which cannot present a token |

**Never** add `auth: false` to routes that return user data or accept write operations without a documented justification.

---

### 13.9 Configuration Reference

| Env Var | Type | Description |
|---|---|---|
| `AUTH_ENTRA_ENABLED` | Boolean | Enables Entra ID strategy (default: `true`) |
| `AUTH_ENTRA_TENANTS` | JSON array | Array of `{ tenantId, allowedGroupIds[] }` objects |
| `AUTH_COGNITO_ENABLED` | Boolean | Enables Cognito strategy (default: `false`) |
| `AUTH_COGNITO_USER_POOL_ID` | String | Cognito User Pool ID (e.g. `eu-west-2_AbcDef`) |
| `AUTH_COGNITO_CLIENT_IDS` | CSV | Comma-separated list of authorised Cognito app client IDs |
| `AUTH_COGNITO_TOKEN_URL` | String | Cognito OAuth2 token endpoint (used by clients to fetch tokens) |

---

*Previous: [Session 1 — Basics & API Endpoints](./op-deepdive-1.md)*
