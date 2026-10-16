# Audit events

This service publishes audit events to the shared `fcp-audit` SNS topic via `@defra/fcp-audit-publisher`, alongside the CloudEvents document upload events it publishes for CRM (see [`docs/asyncapi/v1.yaml`](asyncapi/v1.yaml)). Every publish is fired through `Promise.allSettled` or an explicit `.catch`, so an audit transport failure can never turn a successful request into a `500` or abort an outbox polling run. See [`src/messaging/outbound/audit/send-audit-event.js`](../src/messaging/outbound/audit/send-audit-event.js).

## `entityid` convention

For every event with `entity: 'document'`, `entityid` is the file's UUID (`payload.file.fileId` in the callback payload), never the MongoDB `ObjectId`. Using the UUID consistently means a single id can be used to correlate a document across its whole lifecycle — created, read, and any failure — regardless of which route or background process emitted the event.

**Stated exception:** the auth failure event (`401` responses) has no document in scope at the point a request is rejected, for every route except `GET /api/v1/blob/{fileId}`. Rather than emitting `entity: 'document'` with an empty or absent `entityid`, this event uses `entity: 'request'` with `entityid` set to the correlation id, following the audit service's own `api-audit` convention of entityid-as-trace-id. On `GET /api/v1/blob/{fileId}` the file UUID is already present in the path at rejection time, so that route keeps `entity: 'document'` with the file UUID even on auth failure. This decision was made because `entity` naming is a convention agreed between services rather than a constraint of the `fcp-audit` schema (which permits any lowercase string up to 120 characters and treats `entityid` as optional).

## Event catalogue

| Emitted from | Trigger | Entity | Action | `entityid` | Status | Notes |
|---|---|---|---|---|---|---|
| [`src/plugins/auth/index.js`](../src/plugins/auth/index.js) | Any authenticated route rejected with `401`, except `GET /api/v1/blob/{fileId}` | `request` | `failed` | Correlation id | `failure` | Carries a `security` block (`pmccode: 'AUTH'`, `priority: 1`). No document is identified at rejection time. |
| [`src/plugins/auth/index.js`](../src/plugins/auth/index.js) | `GET /api/v1/blob/{fileId}` rejected with `401` | `document` | `failed` | File UUID (from the path) | `failure` | Same `security` block as above; the file UUID is already known from the route params. |
| [`src/api/v1/callback/index.js`](../src/api/v1/callback/index.js) | `POST /api/v1/callback` persists successfully | `document` | `created` | File UUID | `success` | One event per persisted file. |
| [`src/api/v1/callback/index.js`](../src/api/v1/callback/index.js) | `POST /api/v1/callback` fails Joi schema validation | `document` | `failed` | File UUID (extracted from the raw payload via `extractFileIdsFromPayload`) | `failure` | `details.reason: 'payload_validation_failure'`. Response is still `201 Created`; see [README.md](../README.md#diagnosing-a-rejected-callback). |
| [`src/api/v1/callback/index.js`](../src/api/v1/callback/index.js) | `POST /api/v1/callback` throws during persistence (post-validation) | `document` | `failed` | File UUID (extracted from the raw payload via `extractFileIdsFromPayload`) | `failure` | `details.reason: 'callback_processing_failure'`. |
| [`src/api/v1/blobs/index.js`](../src/api/v1/blobs/index.js) | `GET /api/v1/blob/{fileId}` returns a presigned URL | `document` | `read` | File UUID (from the path) | `success` | Fire-and-forget; a publish failure is logged but does not affect the response. |
| [`src/api/v1/metadata/index.js`](../src/api/v1/metadata/index.js) | `GET /api/v1/metadata/sbi/{sbi}` returns documents | `document` | `read` | File UUID (`doc.file.fileId`) | `success` | One event per document returned. |
| [`src/repos/outbox.js`](../src/repos/outbox.js) | An outbox entry reaches `PERMANENT_FAILURE` after exhausting `OUTBOX_MAX_ATTEMPTS` | `document` | `failed` | File UUID (`payload.file.fileId`), falling back to the outbox entry's `ObjectId` only if the UUID is missing | `failure` | `details.reason` is the terminal error message; `details.attempts` records the attempt count. |

## Configuration

- Topic ARN: `AUDIT_TOPIC_ARN`
- `application`: set with `AUDIT_APPLICATION`, defaulting to `Single Front Door` — names the programme rather than the service so that events group across the estate, and must match every other Single Front Door service
- `component`: the service name, distinguishing this service's events from others under the same `application`
