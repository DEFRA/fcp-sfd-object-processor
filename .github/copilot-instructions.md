# AI Coding Agent Instructions - fcp-sfd-object-processor

## Service Overview
This is a **REST API and messaging gateway** for the Single Front Door (SFD) service. It proxies upload initiation and status requests to [CDP Uploader](https://github.com/DEFRA/cdp-uploader), receives uploader callbacks, persists file metadata to MongoDB, and publishes document and audit events to AWS SNS using the **Transactional Outbox pattern**.

## Critical Architecture Patterns

### Transactional Outbox Pattern (ESSENTIAL)
This service implements a transactional outbox to ensure reliable message delivery. **Never bypass this pattern.**

**How it works:**
1. `POST /api/v1/uploader/initiate` persists a `sessions` record so uploads can be correlated end to end
2. Incoming callback data is persisted to `uploadMetadata`
3. Simultaneously, outbox entries are created in the same MongoDB transaction (see [metadata-service.js](../src/services/metadata-service.js))
4. Background processor polls outbox and publishes to SNS ([outbound/index.js](../src/messaging/outbound/index.js))
5. Successful publishes update outbox status to `SENT` and set `messaging.publishedAt`

**When writing new features:**
- Always use MongoDB sessions and transactions for data+outbox writes
- Follow the pattern in `persistMetadataWithOutbox()` service
- Update outbox status constants in [constants/outbox.js](../src/constants/outbox.js)

### Layered Architecture
```
api/ (routes, handlers, schemas)
  ↓
services/ (business logic, orchestration, transaction management)
  ↓
repos/ (database and storage operations)
  ↓
data/ (MongoDB client)
```

**Rules:**
- Transactional and correlation logic belongs in services
- Simple read handlers may call repos directly, but handlers must not build MongoDB queries
- Repos that participate in transactions accept a `session` parameter

### Authentication Strategy
This service supports **Microsoft Entra ID (Azure AD)** and optional **AWS Cognito** JWT authentication via `@hapi/jwt`.

**Key features:**
- Local compose files disable both auth modes by default. In config, `AUTH_ENTRA_ENABLED` defaults to `true` and `AUTH_COGNITO_ENABLED` defaults to `false`
- When one or more auth strategies are registered, authentication is applied by default to all routes unless explicitly disabled with `auth: false`
- Entra accepts both v1.0 and v2.0 access tokens
- Both strategies can be enabled at once

**Implementation details:**
- Auth plugin registered in [src/api/index.js](../src/api/index.js) after `@hapi/jwt`
- Strategy registration in [src/plugins/auth/index.js](../src/plugins/auth/index.js)
- Entra strategy options in [src/plugins/auth/entra-options.js](../src/plugins/auth/entra-options.js)
- Cognito strategy options in [src/plugins/auth/cognito-options.js](../src/plugins/auth/cognito-options.js)
- Config schema in [src/config/auth.js](../src/config/auth.js)
- Custom format validators in [src/config/formats/entra-security-groups.js](../src/config/formats/entra-security-groups.js), [src/config/formats/entra-tenants-array.js](../src/config/formats/entra-tenants-array.js), and [src/config/formats/cognito-client-ids.js](../src/config/formats/cognito-client-ids.js)

**Token validation:**
1. Verifies token signature against Entra or Cognito JWKS endpoints
2. Checks token type is `JWT` or `at+jwt` (access token)
3. Validates expiry (`exp`), not-before (`nbf`), and issuer (`iss`)
4. For Entra, resolves allowed security groups from `AUTH_ENTRA_TENANTS`; for Cognito, checks `client_id` against `AUTH_COGNITO_CLIENT_IDS`
5. Logs authentication failures with request context and token details such as issuer, groups, or `client_id`

**Disabling authentication for routes:**
```javascript
// Health endpoint example
{
  method: 'GET',
  path: '/health',
  handler,
  options: {
    auth: false  // Disables authentication for this route
  }
}
```

**Current unauthenticated routes:**
- `/health` - Health check endpoint
- `/api/v1/callback` - CDP Uploader callback (external service without auth capabilities)

**When adding new routes:**
- Authentication is applied via `server.auth.default(...)` only when at least one auth strategy is configured
- Only disable with `auth: false` for routes that must be publicly accessible
- Document why authentication is disabled (see callback route for example)

## Technology Stack
- **Runtime:** Node.js v24+ with ESM modules (`type: "module"`)
- **API Framework:** Hapi.js with `hapi-swagger`, `hapi-pino`, and `hapi-pulse`
- **Database:** MongoDB with replica sets (required for transactions)
- **Validation:** Joi schemas in `src/api/**/schema.js` and `src/api/**/schemas/*.js`
- **Testing:** Vitest with V8 coverage (not Jest)
- **Linting:** ESLint v9 with neostandard config
- **AWS SDK:** v3 clients (S3, SNS)
- **HTTP client:** `@fetchkit/ffetch` with retry and backoff
- **Containers:** `defradigital/node-development:latest-24` and `defradigital/node:latest-24`

## Development Workflows

### Running Locally
```bash
# Recommended: Use fcp-sfd-core for full stack
# Standalone development:
docker compose up --build              # Build and start the local stack
npm run docker:dev                     # Start the local stack
npm run docker:dev:d                   # Start the local stack detached
npm run docker:debug                   # Start with debug port 9229 exposed
```

**Important:** The local stack includes MongoDB, Floci, Redis, and CDP Uploader. Floci provides AWS services at `http://floci:4566` inside containers.

### Testing

**Testing Principles:**
- Use Vitest for all testing (not Jest)
- Write tests for all new features and bug fixes
- Ensure tests cover edge cases and error handling
- Reuse the existing mocks and integration test patterns rather than changing production code for test convenience

**Test Execution Commands:**
```bash
npm run docker:test                    # Lint + full test suite in container
npm run docker:test:watch              # Watch mode in container
npm test                               # Local lint + coverage test run (requires MongoDB replica set)
npm run test:watch                     # Local watch mode
npx vitest run test/unit/path/to/file.test.js  # Run a single test file locally
npm run lint                           # ESLint only
```

**Test Structure:**
- `test/unit/` - Unit tests with mocked dependencies
- `test/integration/narrow/` - Integration tests with real MongoDB
- `test/mocks/` - Shared mock data (reuse these)

**Integration Test Pattern:**
```javascript
// Always set unique collection in beforeAll to avoid test interference
beforeAll(async () => {
  originalCollection = config.get('mongo.collections.uploadMetadata')
  config.set('mongo.collections.uploadMetadata', 'my-test-collection')
  collection = config.get('mongo.collections.uploadMetadata')
  await db.collection(collection).deleteMany({})
})

// Clean up in afterAll
afterAll(async () => {
  await db.collection(collection).deleteMany({})
  config.set('mongo.collections.uploadMetadata', originalCollection)
})

// Use server.inject() for API testing
const response = await server.inject({
  method: 'POST',
  url: '/api/v1/callback',
  payload: mockScanAndUploadResponse
})
```

### Mocking Patterns
- **Never mock `mongodb` package directly** - mock `src/data/db.js` instead
- Reuse mocks from `test/mocks/` (especially [cdp-uploader.js](../test/mocks/cdp-uploader.js))
- Mock pattern for transactions:
```javascript
const mockSession = {
  withTransaction: vi.fn().mockImplementation(async (callback) => callback()),
  endSession: vi.fn()
}
client.startSession.mockReturnValue(mockSession)
```
- Mock pattern for auth config (see [test/unit/plugins/auth/index.test.js](../test/unit/plugins/auth/index.test.js) and [test/unit/plugins/auth/entra-options.test.js](../test/unit/plugins/auth/entra-options.test.js)):
```javascript
const mockConfigGet = vi.fn()
vi.mock('../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

// For multi-tenant setups use the tenants array:
mockConfigGet.mockImplementation((key) => {
  switch (key) {
    case 'auth.entra.enabled': return true
    case 'auth.entra.tenants': return [{ tenantId: 'test-tenant-id', allowedGroupIds: ['group-1', 'group-2'] }]
    default: return null
  }
})
```

## Configuration Management
Uses **convict** with configuration split by concern ([src/config/](../src/config/)):
- `server.js` - Port, environment, logging, tracing, metrics, public API URL, outbox timing
- `database.js` - MongoDB connection and collection names
- `aws.js` - AWS region, endpoints, topics, presigned URL expiry, audit application
- `auth.js` - Entra and Cognito authentication settings
- `uploader.js` - CDP Uploader URLs, bucket/path, callback, MIME types, document types, journey ID flag
- `retry.js` - Outbound HTTP retry policy
- `hapi-swagger.js` - OpenAPI and Swagger UI settings

**Access config:** `import { config } from '../config/index.js'` then `config.get('key.path')`

## Common Gotchas

### ESM Module Resolution
- Always use `.js` extensions in imports: `import { foo } from './bar.js'`
- Use `import.meta.url` for `__dirname` equivalent
- Top-level `await` is supported

### MongoDB Sessions
- Transactions require replica sets (configured in Docker Compose)
- Always call `session.endSession()` in a `finally` block
- Use `session.withTransaction()` for automatic rollback on error

### Testing with Vitest
- Use `vi.fn()` and `vi.mock()`, not Jest's `jest.fn()`
- Integration tests need `server.initialize()` before `server.inject()`
- Vitest itself does not need extra Node flags, but the current app start and OpenAPI scripts use `node --experimental-vm-modules`

### API Documentation
- Swagger UI available at `/documentation` when running locally
- Update static OpenAPI spec: run `npm run generateOpenApiSpec` while the server is running
- Routes auto documented via hapi-swagger tags

## File Upload Data Flow
1. Client calls `/api/v1/uploader/initiate`, which proxies to CDP Uploader, rewrites response URLs, and persists a `sessions` record
2. CDP Uploader scans files, uploads to S3, then calls `/api/v1/callback`
3. Callback resolves a `journeyId` and uses it as the upload `correlationId`
4. Callback handler validates payload ([schema.js](../src/api/v1/callback/schema.js))
5. Service filters form data to only file uploads (not text fields)
6. Transaction: insert metadata + status records + outbox entries with the same `correlationId`
7. Background outbox processor publishes batches to SNS (batch size: 10)
8. Successful publishes update `messaging.publishedAt`
9. CRM service consumes SNS events and retrieves files through `/api/v1/blob/{fileId}`

**Key data transformations:**
- Raw CDP payload is normalised, filtered to file uploads, and stored under `raw`, `metadata`, `file`, `s3`, and `messaging` subdocuments
- `/api/v1/uploader/status/{uploadId}` maps CDP Uploader states to `pending`, `success`, or `failure` and strips the internal `journeyId`
- See `formatInboundMetadata()` in [repos/metadata.js](../src/repos/metadata.js)

## SNS Message Format & CRM Integration

Messages published to SNS follow **CloudEvents v1.0** specification. Contract defined in [docs/asyncapi/v1.yaml](../docs/asyncapi/v1.yaml).

**Message structure** (built in [build-document-upload-message-batch.js](../src/messaging/outbound/crm/doc-upload/build-document-upload-message-batch.js)):
```javascript
{
  id: file.fileId,              // UUID for idempotency
  source: 'fcp-sfd-object-processor',
  specversion: '1.0',
  type: 'uk.gov.fcp.sfd.document.uploaded',
  datacontenttype: 'application/json',
  time: '2026-02-16T10:00:00Z', // ISO 8601
  data: {
    crn: 1234567890,
    crm: {
      caseType: 'CS_Agreement_Evidence',
      title: 'Reference - CRN 1234567890 - 16/02/2026'
    },
    correlationId: 'uuid',
    filesInBatch: 1,
    file: {
      fileId: 'uuid',
      fileName: 'document.pdf',
      contentType: 'application/pdf',
      url: 'https://fcp-placeholder.cdp-int.defra.cloud/api/v1/blob/{fileId}'
    },
    sbi: 123456789,
    sourceSystem: 'fcp-sfd-frontend',
    submissionId: 'uuid'
  }
}
```

**When modifying messages:**
- Maintain CloudEvents compliance (required fields: `id`, `source`, `specversion`, `type`, `datacontenttype`, `time`, `data`)
- Use `fileId` as message `id` for idempotency in CRM
- Preserve `correlationId` to group related uploads
- Keep `url` aligned with `PUBLIC_API_BASE_URL` and the `/api/v1/blob/{fileId}` route
- Validate against AsyncAPI schema before publishing

## When Adding New Endpoints
1. Create route module in `src/api/v1/{feature}/index.js`
2. Add Joi validation in `schema.js` or `schemas/`, following the neighbouring route pattern
3. Add a service function when coordinating transactions, correlation, or multi repo workflows
4. Register route in [src/api/router.js](../src/api/router.js)
5. Add unit tests for route logic and supporting services/repos
6. Add integration tests when the route touches MongoDB or upstream services

## Debugging
- Debug port exposed: `9229`
- Use `npm run start:debug` for break-on-start debugging
- Logger available via `createLogger()` from [src/logging/logger.js](../src/logging/logger.js)
- Development logs default to `pino-pretty`. Production logs default to ECS format

## Logging

This service uses Pino with [Elastic Common Schema (ECS)](https://www.elastic.co/guide/en/ecs/current/index.html) formatting in production. For custom structured fields, prefer ECS compatible nested objects such as `event.*`, `error.*`, `http.*`, `process.*`, and `cdp-uploader.*`.

**Approved `event.*` fields:**

| Field | Type | Purpose |
|---|---|---|
| `event.type` | text | Specific event name (e.g. `status_check`) |
| `event.action` | text | Action taken — use for HTTP method or operation |
| `event.category` | text | Broad category — use for request path |
| `event.reference` | text | Reference ID tied to the event — use for `uploadId` or similar |
| `event.reason` | text | Reason/explanation — use for `clientId`, `uploadStatus`, or error cause |
| `event.outcome` | text | Outcome: `success`, `failure`, or `unknown` |
| `event.kind` | text | High-level type — use for HTTP status code |
| `event.duration` | long | Round-trip time in **nanoseconds** (convert ms × 1,000,000) |
| `event.severity` | long | Custom severity level (0–10) |
| `event.created` | date | Time the event was created |

**Rules when writing log utilities:**
- Prefer nested ECS compatible fields instead of inventing new flat top-level keys
- Correlation is logged as `transaction.id` and request tracing as `trace.id`
- Follow the pattern in [src/utils/build-uploader-status-log.js](../src/utils/build-uploader-status-log.js)
- Duration values must be converted to nanoseconds: `duration * 1_000_000`
- Add unit tests for every log builder function (see [test/unit/utils/](../test/unit/utils/))

**Example:**
```javascript
export const buildMyOperationLog = (request, id) => ({
  event: {
    type: 'my_operation',
    action: request.method,
    category: request.path,
    reference: id,
    reason: request.auth?.artifacts?.decoded?.payload?.client_id
  }
})
```

## AWS Integration (Floci)
- CDP Uploader writes files to the bucket configured by `CDP_UPLOADER_S3_BUCKET`
- SNS topic for document events: `DOCUMENT_UPLOAD_EVENTS_TOPIC_ARN`
- SNS topic for audit events: `AUDIT_TOPIC_ARN`
- Use `AWS_S3_FORCE_PATH_STYLE=true` for Floci
- Presigned URL expiry is controlled by `S3_PRESIGNED_URL_EXPIRY_SECONDS`
- Published download URLs use `PUBLIC_API_BASE_URL`
- Endpoints configured in [src/config/aws.js](../src/config/aws.js)

## Configuration & Environment Variables
Defaults for local development live mainly in [compose.yaml](../compose.yaml) and [compose.test.yaml](../compose.test.yaml). Additional optional overrides and non-default values are documented in [../.env.example](../.env.example) and the schemas under [src/config/](../src/config/).

Reference these files for:
- MongoDB connection strings, database name, and collection related settings
- CDP Uploader URLs, endpoint paths, bucket/path, callback URL, MIME types, document types, max file size, and `JOURNEY_ID_ENABLED`
- AWS service endpoints, topic ARNs, audit application, presigned URL expiry, and public API base URL
- Auth settings for Entra (`AUTH_ENTRA_TENANTS`) and Cognito (`AUTH_COGNITO_*`)
- HTTP retry policy variables and metrics/tracing flags
- Message processing limits and outbox retention settings

## Deployment & CI/CD

Deployments are automated via GitHub Actions:

**Pull Request Checks** ([check-pull-request.yml](workflows/check-pull-request.yml)):
- Runs on PRs to `main` and on manual dispatch
- Uses Node.js 24 with `npm ci`
- Builds the Docker image with `--no-cache`
- Runs the Docker Compose test stack and produces coverage for SonarQube
- Runs SonarQube analysis

**Production Publish** ([publish.yml](workflows/publish.yml)):
- Triggers on push to `main` or manual dispatch
- Runs `npm ci`
- Runs the Docker Compose test stack and coverage generation
- Runs SonarQube analysis
- Uses the DEFRA CDP build action for container publishing

**Hotfix Workflow** ([publish-hotfix.yml](workflows/publish-hotfix.yml)):
- Triggered by manual dispatch
- Uses Node.js 24 with `npm ci`
- Runs the Docker Compose test stack
- Uses the DEFRA CDP hotfix build action
- Runs SonarQube analysis

**Testing in CI:**
```bash
# What CI runs:
docker compose -f compose.yaml -f compose.test.yaml run --build --rm 'fcp-sfd-object-processor'
```

**Before merging PRs:**
- Ensure all tests pass locally via `npm run docker:test`
- Check SonarQube dashboard for quality and coverage issues
- Verify the Docker build succeeds

---

# Defra Standards Code Reviewer

You are an experienced code reviewer working on a Defra digital service. Review code systematically against Defra software development standards and common quality criteria.

## Review categories

Work through each category in order. Skip categories that do not apply to the change.

### 1. Correctness and behaviour
- The code does what the PR description says it does
- Edge cases are handled (null, empty, boundary values)
- Error paths return useful messages without leaking internals

### 2. Tests and coverage
- New code has unit tests covering the happy path and key error paths
- Test names describe the behaviour being verified
- Coverage does not decrease — target is 90% minimum (check SonarCloud quality gate)
- Route handlers include tests for validation failure, CSRF, and auth where applicable
- **Node.js**: Vitest for unit/integration tests, `server.inject()` for route testing (Hapi)

### 3. Security
- No secrets, API keys, or tokens in code (use environment variables)
- User input is validated and sanitised
- Dependencies are from trusted sources with no known vulnerabilities
- Logging does not contain PII (names, addresses, emails, NI numbers, bank details)
- SonarCloud security hotspots are reviewed and resolved
- No new vulnerabilities or code smells introduced (SonarWay profile)

### 4. Performance and reliability
- No blocking operations on the event loop (Node.js)
- Database queries are indexed and bounded
- External calls have timeouts and retry logic

### 5. Maintainability and readability
- No commented-out code
- Functions and variables have descriptive names
- Complex logic has explanatory comments or is split into named functions ("separate in order to name")
- No magic numbers or strings — use named constants

### 6. Architecture and boundaries
- Code follows the existing project structure
- Dependencies flow inward (controllers → services → repositories)
- No circular dependencies between modules

### 7. Documentation
- Public functions have JSDoc or XML doc comments
- README is updated if setup steps or prerequisites change
- Breaking changes are clearly documented

### 8. Accessibility (frontend changes only)
- HTML meets WCAG 2.2 Level AA
- Interactive elements are keyboard accessible
- Images have alt text, form fields have labels
- Error summaries link to the corresponding form field

## Severity levels

Use these labels for findings:

- **Blocking** — must fix before merge (security issues, incorrect behaviour, failing tests)
- **Recommended** — improves quality, discuss with author (readability, performance)
- **Nit** — minor preference, optional (formatting, naming style)

## Output format

Structure findings by file. For each file with issues, provide:
- **File:** `path/to/file.js` (line numbers)
- **Category & Severity:** Category name + [Blocking|Recommended|Nit]
- **Issue:** Clear description
- **Fix:** Suggested code snippet where helpful

Summarise at the end: total findings by severity, and whether the PR is ready to merge.

**Do not post comments about:**
- PR description or title
- Branch name or commit history
- Only post code review comments on the changed files themselves

## References

- [Defra common coding standards](https://github.com/DEFRA/software-development-standards/blob/main/docs/standards/common_coding_standards.md)
- [Defra security standards](https://github.com/DEFRA/software-development-standards/blob/main/docs/standards/security_standards.md)
- [Defra logging standards](https://github.com/DEFRA/software-development-standards/blob/main/docs/standards/logging_standards.md)