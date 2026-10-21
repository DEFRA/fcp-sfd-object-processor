# Audit events

This service publishes audit events to the shared `fcp-audit` SNS topic via `@defra/fcp-audit-publisher`, alongside the CloudEvents document upload events it publishes for CRM (see [`docs/asyncapi/v1.yaml`](asyncapi/v1.yaml)). Every publish is fired through `Promise.allSettled` or an explicit `.catch`, so an audit transport failure can never turn a successful request into a `500` or abort an outbox polling run. See [`src/messaging/outbound/audit/send-audit-event.js`](../src/messaging/outbound/audit/send-audit-event.js).

## `entityid` convention

For every event with `entity: 'document'`, `entityid` is the file's UUID (`payload.file.fileId` in the callback payload), never the MongoDB `ObjectId`. Using the UUID consistently means a single id can be used to correlate a document across its whole lifecycle — created, read, and any failure — regardless of which route or background process emitted the event.

**Stated exception:** the auth failure event (`401` responses) has no document in scope at the point a request is rejected, for every route except `GET /api/v1/blob/{fileId}`. Rather than emitting `entity: 'document'` with an empty or absent `entityid`, this event uses `entity: 'request'` with `entityid` set to the correlation id, following the audit service's own `api-audit` convention of entityid-as-trace-id. On `GET /api/v1/blob/{fileId}` the file UUID is already present in the path at rejection time, so that route keeps `entity: 'document'` with the file UUID even on auth failure. This decision was made because `entity` naming is a convention agreed between services rather than a constraint of the `fcp-audit` schema (which permits any lowercase string up to 120 characters and treats `entityid` as optional).

## Event catalogue

| Emitted from | Trigger | Entity | Action | `entityid` | Status | `accounts` | Notes |
|---|---|---|---|---|---|---|---|
| [`src/plugins/auth/index.js`](../src/plugins/auth/index.js) | Any authenticated route rejected with `401`, except `GET /api/v1/blob/{fileId}` | `request` | `failed` | Correlation id | `failure` | None | Carries a `security` block (`pmccode: 'AUTH'`, `priority: 1`). No document is identified at rejection time. |
| [`src/plugins/auth/index.js`](../src/plugins/auth/index.js) | `GET /api/v1/blob/{fileId}` rejected with `401` | `document` | `failed` | File UUID (from the path) | `failure` | None | Same `security` block as above; the file UUID is already known from the route params. |
| [`src/api/v1/callback/index.js`](../src/api/v1/callback/index.js) | `POST /api/v1/callback` persists successfully | `document` | `created` | File UUID | `success` | `sbi`, when known; `crn`, when valid | One event per persisted file. |
| [`src/api/v1/callback/index.js`](../src/api/v1/callback/index.js) | `POST /api/v1/callback` fails Joi schema validation | `document` | `failed` | File UUID (extracted from the raw payload via `extractFileIdsFromPayload`) | `failure` | `sbi`, when known; `crn`, when valid | `details.reason: 'payload_validation_failure'`. Response is still `201 Created`; see [README.md](../README.md#diagnosing-a-rejected-callback). |
| [`src/api/v1/callback/index.js`](../src/api/v1/callback/index.js) | `POST /api/v1/callback` throws during persistence (post-validation) | `document` | `failed` | File UUID (extracted from the raw payload via `extractFileIdsFromPayload`) | `failure` | `sbi`, when known; `crn`, when valid | `details.reason: 'callback_processing_failure'`. |
| [`src/api/v1/blobs/index.js`](../src/api/v1/blobs/index.js) | `GET /api/v1/blob/{fileId}` returns a presigned URL | `document` | `read` | File UUID (from the path) | `success` | `sbi`, when known; `crn`, when valid | CRN identifies the uploader, not the reader. Fire-and-forget; a publish failure is logged but does not affect the response. |
| [`src/api/v1/metadata/index.js`](../src/api/v1/metadata/index.js) | `GET /api/v1/metadata/sbi/{sbi}` returns documents | `document` | `read` | File UUID (`doc.file.fileId`) | `success` | `sbi` | One event per request, listing every returned document as an entity. |
| [`src/repos/outbox.js`](../src/repos/outbox.js) | An outbox entry reaches `PERMANENT_FAILURE` after exhausting `OUTBOX_MAX_ATTEMPTS` | `document` | `failed` | File UUID (`payload.file.fileId`), falling back to the outbox entry's `ObjectId` only if the UUID is missing | `failure` | `sbi`, when known; `crn`, when valid | `details.reason` is the terminal error message; `details.attempts` records the attempt count. |

## Accounts

Per-upload events (`created`, both callback `failed` reasons, blob `read`, and outbox terminal `failed`) include `accounts.sbi` when known and `accounts.crn` when valid. The CRN comes from upload metadata and identifies the customer who made the upload. On a blob `read` event it is still the uploader's CRN, not the reader's. Agents do not upload.

A CRN is included only when it is an integer number or a string containing digits only, and its numeric value is between `CRN_MIN` and `CRN_MAX` in [`src/constants/schemas.js`](../src/constants/schemas.js). The emitted value is canonicalized as `String(Number(crn))`; invalid, missing, or out-of-range values are omitted without preventing the audit event from being published.

The `GET /api/v1/metadata/sbi/{sbi}` event remains SBI-only. It is one event per request and can list multiple documents, while `accounts.crn` can hold only one value; assigning one document's CRN would misattribute the others. This is decision B; its Confluence decision record must be linked here before PR 5 merges.

The `401` authentication events carry no `accounts`, because no upload metadata is available. CRNs are not written to service logs; CRNs included on audit events are redacted from audit publish failure reasons. The
redaction format is that all characters are substituted for asterix '*' except for the last 4 digits.

## Configuration

- Topic ARN: `AUDIT_TOPIC_ARN`
- `application`: set with `AUDIT_APPLICATION`, defaulting to `Single Front Door` — names the programme rather than the service so that events group across the estate, and must match every other Single Front Door service
- `component`: the service name, distinguishing this service's events from others under the same `application`
