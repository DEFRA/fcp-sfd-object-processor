# Code Review: FLS1-180-report-the-true-upload-outcome

**Date:** 15/09/2026 14:15
**Reviewer:** GitHub Copilot
**Grade:** D

## Summary

This branch implements the intended shift from scanner-only status to a merged scanner plus local-processing verdict, and it adds meaningful integration/unit coverage for callback rejection, delivery failure, and unresolved correlation paths. The initiate flow now correctly fails with 503 when session persistence fails, and journey-id logging/correlation behavior is improved. One blocking logic issue remains in multi-file delivery verdict aggregation, where a single permanently failed file can be masked by another file that has already published, producing a false success.

## Changed Files

| File | Status | Verdict |
|------|--------|---------|
| docs/openapi/v1.json | Modified | Minor Issues |
| src/api/v1/uploader/initiate/index.js | Modified | OK |
| src/api/v1/uploader/status/index.js | Modified | Major Issues |
| src/api/v1/uploader/status/schema.js | Modified | OK |
| src/config/uploader.js | Modified | OK |
| src/mappers/status.js | Modified | OK |
| src/repos/metadata.js | Modified | OK |
| src/repos/outbox.js | Modified | OK |
| src/repos/sessions.js | Modified | OK |
| src/services/journey-correlation-service.js | Modified | OK |
| test/integration/narrow/api/uploader/initiate.test.js | Modified | OK |
| test/integration/narrow/api/uploader/status.test.js | Modified | Minor Issues |
| test/unit/api/uploader/initiate.test.js | Modified | OK |
| test/unit/api/v1/uploader/initiate/functions.test.js | Modified | OK |
| test/unit/api/v1/uploader/status/handler.test.js | Modified | Minor Issues |
| test/unit/api/v1/uploader/status/schema.test.js | Modified | OK |
| test/unit/mappers/status.test.js | Modified | OK |
| test/unit/repos/metadata/metadata.test.js | Modified | OK |
| test/unit/repos/outbox.test.js | Modified | OK |
| test/unit/services/journey-correlation-service.test.js | Modified | OK |

## Detailed Review

### src/api/v1/uploader/status/index.js

**Status:** Modified

**Correctness and behaviour [Blocking]**
- Delivery verdict aggregation can misreport success when at least one file has permanently failed but another file has already published.
- Current logic uses branch-level booleans:
  - hasPublishedAt = metadataRecords.some(...)
  - hasPermanentFailure = outboxRecords.some(...)
  - and returns failure only when !hasPublishedAt && hasPermanentFailure.
- This violates the branch rule "Any failing file fails the upload." Example: two files, one delivered (publishedAt set), one PERMANENT_FAILURE and not published -> endpoint returns success/accepted.
- Location: [src/api/v1/uploader/status/index.js](src/api/v1/uploader/status/index.js#L192), [src/api/v1/uploader/status/index.js](src/api/v1/uploader/status/index.js#L193), [src/api/v1/uploader/status/index.js](src/api/v1/uploader/status/index.js#L195), [src/api/v1/uploader/status/index.js](src/api/v1/uploader/status/index.js#L203)

**Suggested fix direction**
- Evaluate verdict per fileId rather than global .some(...) booleans.
- Fail when any file has terminal outbox failure and no corresponding publishedAt.
- Keep pending semantics for missing correlation/no local records unchanged.

### test/integration/narrow/api/uploader/status.test.js

**Status:** Modified

**Tests and coverage [Recommended]**
- Strong new end-to-end coverage exists for accepted, processor-rejected, delivery-failed, and unresolved-correlation scenarios.
- A targeted scenario is still missing for mixed multi-file outcomes (one published + one permanent failure), which is the edge case that currently slips through as false success.
- Location for affected suite: [test/integration/narrow/api/uploader/status.test.js](test/integration/narrow/api/uploader/status.test.js#L466)

### test/unit/api/v1/uploader/status/handler.test.js

**Status:** Modified

**Tests and coverage [Recommended]**
- Unit tests validate happy-path and error handling well, but there is no explicit test for mixed-file aggregation where success and permanent failure coexist.
- Adding this unit test would have caught the current blocking bug earlier and cheaper than integration-only detection.
- Location for handler suite: [test/unit/api/v1/uploader/status/handler.test.js](test/unit/api/v1/uploader/status/handler.test.js#L198)

### docs/openapi/v1.json

**Status:** Modified

**Documentation [Nit]**
- Response examples for GET /api/v1/uploader/status/{uploadId} still omit required stage and errors fields, while schema now marks them required.
- This can mislead consumers reading examples even though runtime schema enforcement is correct.
- Location: [docs/openapi/v1.json](docs/openapi/v1.json#L1228), [docs/openapi/v1.json](docs/openapi/v1.json#L1259), [docs/openapi/v1.json](docs/openapi/v1.json#L1288)

### src/api/v1/uploader/initiate/index.js

**Status:** Modified

No issues found. Session-persist failure now correctly surfaces as 503 and avoids issuing a successful initiate response.

### src/config/uploader.js

**Status:** Modified

No issues found. Feature gate removal is consistent with always-on journey id behavior in code.

### src/mappers/status.js

**Status:** Modified

No issues found. Fallback validation error preserves semantic rejection reason and maintains sanitization constraints.

### src/repos/metadata.js

**Status:** Modified

No issues found. Added read helper is minimal and uses indexed lookup by ile.fileId.

### src/repos/outbox.js

**Status:** Modified

No issues found. Added status lookup helper is minimal and uses indexed lookup by payload.file.fileId.

### src/repos/sessions.js

**Status:** Modified

No issues found. Added uploadId lookup aligns with existing unique index on uploadId.

### src/services/journey-correlation-service.js

**Status:** Modified

No issues found. Logging now keeps validated journey ids in unresolved branches while still avoiding raw unvalidated input.

### test/integration/narrow/api/uploader/initiate.test.js

**Status:** Modified

No issues found. Assertions align with new 503 behavior.

### test/unit/api/uploader/initiate.test.js

**Status:** Modified

No issues found. Unit expectations correctly updated for Boom 503 on session write failure.

### test/unit/api/v1/uploader/initiate/functions.test.js

**Status:** Modified

No issues found. Gate removal reflected cleanly.

### test/unit/api/v1/uploader/status/schema.test.js

**Status:** Modified

No issues found. Schema tests cover required stage and errors fields.

### test/unit/mappers/status.test.js

**Status:** Modified

No issues found. Fallback error message behavior is covered.

### test/unit/repos/metadata/metadata.test.js

**Status:** Modified

No issues found. New query helper tests cover empty/non-array guards and projection path.

### test/unit/repos/outbox.test.js

**Status:** Modified

No issues found. New query helper tests cover empty/non-array guards and projection path.

### test/unit/services/journey-correlation-service.test.js

**Status:** Modified

No issues found. Tests verify validated id appears only where safe and malformed raw value is not echoed.

## Recommendations

1. Fix per-file delivery aggregation in [src/api/v1/uploader/status/index.js](src/api/v1/uploader/status/index.js#L192) to ensure one permanently failed file cannot be masked by another successful file.
2. Add a focused integration test in [test/integration/narrow/api/uploader/status.test.js](test/integration/narrow/api/uploader/status.test.js#L466) for mixed outcomes across multiple files (one publishedAt, one PERMANENT_FAILURE) expecting ailure/delivery-failed.
3. Add a matching unit test in [test/unit/api/v1/uploader/status/handler.test.js](test/unit/api/v1/uploader/status/handler.test.js#L198) to lock in per-file aggregation semantics.
4. Refresh status endpoint examples in [docs/openapi/v1.json](docs/openapi/v1.json#L1228) to include stage and errors fields for each example payload.