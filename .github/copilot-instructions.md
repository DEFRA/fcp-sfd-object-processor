# AI Coding Agent Instructions - fcp-sfd-object-processor

## Service Overview
This is a **messaging gateway** for the Single Front Door (SFD) service that processes file upload metadata. It receives callbacks from [CDP Uploader](https://github.com/DEFRA/cdp-uploader), persists metadata to MongoDB, and publishes events to AWS SNS using the **Transactional Outbox pattern**.

## Critical Architecture Patterns

### Transactional Outbox Pattern (ESSENTIAL)
This service implements a transactional outbox to ensure reliable message delivery. **Never bypass this pattern.**

**How it works:**
1. Incoming data is persisted to `uploadMetadata` collection
2. Simultaneously, outbox entries are created in same MongoDB transaction (see [metadata-service.js](../src/services/metadata-service.js))
3. Background processor polls outbox and publishes to SNS ([outbound/index.js](../src/messaging/outbound/index.js))
4. Successful publishes update outbox status to `SENT`

**When writing new features:**
- Always use MongoDB sessions and transactions for data+outbox writes
- Follow the pattern in `persistMetadataWithOutbox()` service
- Update outbox status constants in [constants/outbox.js](../src/constants/outbox.js)

### Layered Architecture
```
api/ (routes, handlers, schemas)
  ↓
services/ (business logic, orchestrates repos, manages transactions)
  ↓
repos/ (database operations, accepts sessions)
  ↓
data/ (MongoDB client)
```

**Rules:**
- API handlers call services, never repos directly
- Services coordinate transactions and call multiple repos
- Repos accept `session` parameter for transactions
- Never create DB queries in API handlers

### Authentication Strategy
This service uses **Microsoft Entra ID (Azure AD) JWT authentication** via `@hapi/jwt` plugin.

**Key features:**
- Configurable via `AUTH_ENABLED` environment variable (default: `true`)
- Validates tokens from Azure AD tenant specified in `AUTH_TENANT_ID`
- Requires security group membership - tokens must contain at least one group ID from `AUTH_ALLOWED_GROUP_IDS` (comma-separated UUIDs)
- Default authentication on all routes unless explicitly disabled with `auth: false`
- Accepts both v1.0 and v2.0 Azure AD access tokens

**Implementation details:**
- Auth plugin registered in [src/api/index.js](../src/api/index.js) after `@hapi/jwt`
- Strategy configuration in [src/plugins/auth.js](../src/plugins/auth.js)
- Config schema in [src/config/auth.js](../src/config/auth.js)
- Custom format validator for security group UUIDs in [src/config/formats/security-groups.js](../src/config/formats/security-groups.js)

**Token validation:**
1. Verifies token signature against Azure AD public keys
2. Checks token type is `JWT` or `at+jwt` (access token)
3. Validates expiry (`exp`), not-before (`nbf`), and issuer (`iss`)
4. Ensures token contains at least one matching security group from `AUTH_ALLOWED_GROUP_IDS`
5. Logs authentication failures with request context (path, method, IP, user-agent, token groups)

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
- Authentication is applied by default (via `server.auth.default('entra')`)
- Only disable with `auth: false` for routes that must be publicly accessible
- Document why authentication is disabled (see callback route for example)

## Technology Stack
- **Runtime:** Node.js v22+ with ESM modules (`type: "module"`)
- **API Framework:** Hapi.js with hapi-swagger for OpenAPI
- **Database:** MongoDB with replica sets (required for transactions)
- **Validation:** Joi schemas in `src/api/v*/*/schema.js`
- **Testing:** Vitest (not Jest!)
- **Linting:** neostandard ESLint config
- **AWS SDK:** v3 clients (S3, SNS)

## Development Workflows

### Running Locally
```bash
# Recommended: Use fcp-sfd-core for full stack
# Standalone development:
docker compose up --build              # Standard dev mode
npm run docker:dev                     # Same as above
npm run docker:debug                   # With debug ports exposed
```

**Important:** LocalStack provides AWS services (S3, SNS) at `http://localstack:4566` in containers.

### Testing

**Testing Principles:**
- Use Vitest for all testing (not Jest!)
- Write tests for all new features and bug fixes
- Ensure tests cover edge cases and error handling
- **NEVER change the original code to make it easier to test** - write tests that cover the original code as-is

**Test Execution Commands:**
```bash
npm run docker:test                    # Full test suite in container
npm run docker:test:watch              # Watch mode in container
npm test                               # Local tests (requires MongoDB)
npm run test:watch                     # Local watch mode
npm run test:lint                      # ESLint only
```

** Testing Workflow:**
- Test must be ran using the watch-docker-tests skill.

**Test Structure:**
- `test/unit/` - Unit tests with mocked dependencies
- `test/integration/narrow/` - Integration tests with real MongoDB
- `test/mocks/` - Shared mock data (reuse these!)

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
- Mock pattern for auth config (see [test/unit/plugins/auth.test.js](../test/unit/plugins/auth.test.js)):
```javascript
const mockConfigGet = vi.fn()
vi.mock('../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

mockConfigGet.mockImplementation((key) => {
  switch (key) {
    case 'auth.enabled': return true
    case 'auth.tenant': return 'test-tenant-id'
    case 'auth.allowedGroupIds': return ['group-1', 'group-2']
    default: return null
  }
})
```

## Configuration Management
Uses **convict** with environment-specific configs ([src/config/](../src/config/)):
- `server.js` - Port, environment, logging
- `database.js` - MongoDB connection and collections
- `aws.js` - AWS SDK configuration
- `uploader.js` - CDP Uploader URL

**Access config:** `import { config } from '../config/index.js'` then `config.get('key.path')`

## Common Gotchas

### ESM Module Resolution
- Always use `.js` extensions in imports: `import { foo } from './bar.js'`
- Use `import.meta.url` for `__dirname` equivalent
- Top-level `await` is supported

### MongoDB Sessions
- Transactions require replica sets (configured in docker-compose)
- Always call `session.endSession()` in finally block
- Use `session.withTransaction()` for automatic rollback on error

### Testing with Vitest
- Use `vi.fn()` and `vi.mock()` not Jest's `jest.fn()`
- Integration tests need `server.initialize()` before `server.inject()`
- Don't use `--experimental-vm-modules` flag (vitest handles this)

### API Documentation
- Swagger UI available at `/documentation` when running locally
- Update static OpenAPI spec: run `npm run generateOpenApiSpec` while server is running
- Routes auto-documented via hapi-swagger tags

## File Upload Data Flow
1. CDP Uploader scans files → uploads to S3 → calls `/api/v1/callback`
2. Callback handler validates payload ([schema.js](../src/api/v1/callback/schema.js))
3. Service filters form data to only file uploads (not text fields)
4. Transaction: insert metadata + create outbox entries with same `correlationId`
5. Background: outbox processor publishes batches to SNS (batch size: 10)
6. Successful publishes update `messaging.publishedAt` timestamp
7. CRM service consumes SNS events to create cases with attachments

**Key data transformations:**
- Raw CDP payload → structured documents with `raw`, `metadata`, `file`, `s3`, `messaging` subdocuments
- See `formatInboundMetadata()` in [repos/metadata.js](../src/repos/metadata.js)

**Note:** CDP Uploader integration patterns are still under active testing - verify edge cases when implementing new callback features.

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
    crn: 1234567890,            // Customer Reference Number
    crm: {
      caseType: 'CS_Agreement_Evidence',  // CRM queue name
      title: 'Reference - CRN 1234567890 - 16/02/2026'
    },
    correlationId: 'uuid',      // Links related events
    file: {
      fileId: 'uuid',
      fileName: 'document.pdf',
      contentType: 'application/pdf',
      url: 'https://fcp-placeholder.cdp-int.defra.cloud/api/v1/blobs/{fileId}'
    },
    sbi: 123456789,              // Single Business Identifier
    sourceSystem: 'fcp-sfd-frontend',  // Or 'rps-portal'
    submissionId: 'uuid'
  }
}
```

**When modifying messages:**
- Maintain CloudEvents compliance (required fields: `id`, `source`, `specversion`, `type`, `datacontenttype`, `time`, `data`)
- Use `fileId` as message `id` for idempotency in CRM
- Preserve `correlationId` to group related uploads
- Validate against AsyncAPI schema before publishing

## When Adding New Endpoints
1. Create schema in `src/api/v1/{feature}/schema.js`
2. Create handler in `src/api/v1/{feature}/index.js` (follow callback route pattern)
3. Add service function if orchestrating multiple repos
4. Register route in [src/api/router.js](../src/api/router.js)
5. Add unit tests for handler, service, repo layers
6. Add integration test with unique collection name

## Debugging
- Debug port exposed: `9229`
- Use `npm run start:debug` for break-on-start debugging
- Logger available via `createLogger()` from [src/logging/logger.js](../src/logging/logger.js)
- Logs use ECS format (Elastic Common Schema)

## AWS Integration (LocalStack)
- S3 bucket for file storage: configured via `S3_BUCKET` env var
- SNS topic for events: `DOCUMENT_UPLOAD_EVENTS_TOPIC_ARN`
- Use `AWS_S3_FORCE_PATH_STYLE=true` for LocalStack
- Endpoints configured in [src/config/aws.js](../src/config/aws.js)

## Configuration & Environment Variables
All environment variables are documented in [compose.yaml](../compose.yaml) and related compose files. Reference these files for:
- MongoDB connection strings (requires replica set)
- AWS service endpoints (LocalStack vs production)
- Service URLs (CDP Uploader)
- Message processing intervals and batch sizes

## Deployment & CI/CD

Deployments are automated via GitHub Actions:

**Pull Request Checks** ([check-pull-request.yml](../workflows/check-pull-request.yml)):
- Runs on PRs to `main`
- Executes full test suite in Docker
- Builds Docker image without cache
- Runs SonarQube analysis

**Production Publish** ([publish.yml](../workflows/publish.yml)):
- Triggers on push to `main` or manual dispatch
- Runs tests + coverage reports
- SonarQube quality gate
- Uses DEFRA CDP build action for container publishing

**Hotfix Workflow** ([publish-hotfix.yml](../workflows/publish-hotfix.yml)):
- Available for emergency releases

**Testing in CI:**
```bash
# What CI runs:
docker compose -f compose.yaml -f compose.test.yaml run --build --rm 'fcp-sfd-object-processor'
```

**Before merging PRs:**
- Ensure all tests pass locally via `npm run docker:test`
- Check SonarQube dashboard for quality/coverage issues
- Verify Docker build succeeds
