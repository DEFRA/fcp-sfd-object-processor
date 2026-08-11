# Outbox concurrency QA test

> **Non-production only.** Do not run this tooling against a production database.

This test creates related metadata and `PENDING` outbox records so multiple object-processor instances can compete for work. It verifies atomic claim ownership; it does not provide exactly-once delivery. The outbox remains at-least-once and downstream consumers must remain idempotent.

## Prerequisites

- `mongosh` with authorised read/write access to the object processor database.
- Permission to insert, query and delete records in `uploadMetadata` and `outbox`.
- For local testing, Docker with Compose v2.
- For an environment test, an approved non-production environment with at least two object-processor instances.

Obtain database access through the team's approved method. Supply the connection string to `mongosh` when running the script. Do not add credentials, connection strings or environment-specific configuration to this repository.

## Configuration

The script reads these optional global configuration values. Set them with `mongosh --eval` before executing the script:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OUTBOX_QA_RECORD_COUNT` | `250` | Number of metadata and outbox records to create. Use more than twice `MONGO_OUTBOX_QUERY_LIMIT`. |
| `OUTBOX_QA_TEST_RUN_ID` | Generated | Unique identifier attached to every generated record. Must be at least eight characters. |
| `OUTBOX_QA_MODE` | `insert` | Set to `cleanup` to remove one test run. |
| `OUTBOX_QA_CONFIRM_CLEANUP` | None | Must equal `DELETE <test-run-id>` before cleanup is allowed. |

The generated file IDs and correlation IDs are unique and remain stable throughout retries. Reusing an existing test-run identifier is rejected.

## Run locally with two instances

The QA Compose overlay removes the fixed application container name and host ports, allowing Compose to create multiple workers. MongoDB remains available to the host on port `27017`.

Start the stack from the repository root:

```sh
docker compose -f compose.yaml -f compose.override.yaml -f compose.qa.yaml up --build --scale fcp-sfd-object-processor=2
```

Confirm that two workers are running:

```sh
docker compose -f compose.yaml -f compose.override.yaml -f compose.qa.yaml ps fcp-sfd-object-processor
```

In another terminal, run the read-only mounted script using `mongosh` from the MongoDB container:

```sh
docker compose -f compose.yaml -f compose.override.yaml -f compose.qa.yaml exec -T mongodb mongosh "mongodb://localhost:27017/fcp-sfd-object-processor?replicaSet=rs0" /qa/outbox-concurrency.mongosh.js
```

This does not require `mongosh` to be installed on the host.

To use an explicit test-run identifier or record count:

```sh
docker compose -f compose.yaml -f compose.override.yaml -f compose.qa.yaml exec -T mongodb mongosh "mongodb://localhost:27017/fcp-sfd-object-processor?replicaSet=rs0" --eval 'globalThis.OUTBOX_QA_TEST_RUN_ID="outbox-qa-local-001"; globalThis.OUTBOX_QA_RECORD_COUNT=250' /qa/outbox-concurrency.mongosh.js
```

Inspect both workers' structured logs:

```sh
docker compose -f compose.yaml -f compose.override.yaml -f compose.qa.yaml logs fcp-sfd-object-processor
```

## Run in a non-production environment

1. Record the deployed version, CPU, memory and current instance count.
2. Deploy the implementation and use **Edit** in the CDP Portal to set the object processor to at least two instances.
3. Confirm from deployment information and logs that two distinct instances are running.
4. Open the service's **Terminal** tab in CDP Portal and launch a backend terminal for the environment.
5. Upload `scripts/qa/outbox-concurrency.mongosh.js` using the terminal's **Files** tab.
6. Set the record count to more than twice the environment's `MONGO_OUTBOX_QUERY_LIMIT`; use the script default of `250` when the limit is `100`.
7. Run `mongosh`, which automatically authenticates the terminal to the service database.
8. From the `mongosh` prompt, run `load('outbox-concurrency.mongosh.js')` and record the printed test-run identifier.

The script does not depend on CDP Terminal and may instead be run through another approved `mongosh` connection. Do not put credentials or an environment connection string in the script.

## CDP ECS log fields

CDP retains a restricted subset of the Elastic Common Schema. Outbox logs use the following retained fields; unsupported custom fields are removed during ingestion.

| Information | ECS field |
| --- | --- |
| Event name | `event.type` |
| Operation or state transition | `event.action` |
| Outbox MongoDB `_id` | `event.reference` |
| Outcome | `event.outcome` |
| Claim creation time | `event.created` |
| Claim lease duration in nanoseconds | `event.duration` |
| Failure or rejection reason | `event.reason` |
| Worker identifier | `process.name` |
| Stable file/message identifier | `transaction.id` |
| Error classification | `error.type` |
| Error code | `error.code` |
| Error description | `error.message` |
| Attempt count and other details without a suitable ECS field | `message` |

CDP also supplies `host.hostname`, `ecs_task_arn` and `container_id`. Use these fields as supporting evidence that the workers ran in distinct deployed instances.

Useful OpenSearch DQL filters are:

```text
event.type:"outbox_claimed"
event.type:"outbox_finalized" AND event.action:"finalize_sent"
event.type:"outbox_finalized" AND (event.action:"finalize_pending" OR event.action:"finalize_failed")
event.type:"outbox_claim_reclaimed"
event.type:"outbox_finalization_rejected"
event.type:"outbox_publish_result_unmatched"
event.type:"outbox_terminal_failure_imminent" OR event.type:"outbox_terminal_failure"
```

Add `event.reference`, `event.action`, `event.outcome`, `process.name`, `transaction.id`, `host.hostname`, `ecs_task_arn` and `container_id` as columns in OpenSearch Discover.

## Inspect the result

The script prints inspection queries containing the exact test-run identifier. Run them in the same database. Use the matching outbox documents' `_id` values to find their application logs through `event.reference`.

Verify that:

- at least two distinct `process.name` worker identifiers claim records from the test run;
- `host.hostname`, `ecs_task_arn` or `container_id` confirms that those workers ran in distinct service instances;
- no record has overlapping valid claim ownership;
- non-expired claims are not taken by another worker;
- claim and finalisation events correlate through `event.reference` and retain the same `transaction.id`;
- finalisation is performed only by the current `process.name` claim owner;
- successfully published records reach `SENT`;
- no record remains indefinitely in `PROCESSING`.

If practical, stop or redeploy one instance after it claims records. After the lease expires, verify that another worker reclaims them and that the previous owner cannot finalise them.

Compose scheduling does not guarantee that both local workers receive records. The default volume makes participation likely, but the worker IDs in the logs are the evidence. Repeat with a larger record count if only one worker participates.

Confirm that the required ECS fields are present in the `cdp-logs*` index after ingestion. Capture the instance count, worker identifiers, runtime instance fields, test-run identifier, relevant claim/finalisation logs and final MongoDB status counts as evidence.

## Clean up

Cleanup is restricted to records carrying one explicit, non-empty test-run identifier. Copy the exact identifier printed during insertion and provide the required confirmation.

Local container example:

```sh
docker compose -f compose.yaml -f compose.override.yaml -f compose.qa.yaml exec -T mongodb mongosh "mongodb://localhost:27017/fcp-sfd-object-processor?replicaSet=rs0" --eval 'globalThis.OUTBOX_QA_MODE="cleanup"; globalThis.OUTBOX_QA_TEST_RUN_ID="outbox-qa-local-001"; globalThis.OUTBOX_QA_CONFIRM_CLEANUP="DELETE outbox-qa-local-001"' /qa/outbox-concurrency.mongosh.js
```

The script reports the number of deleted `outbox` and `uploadMetadata` records. Query both collections using the test-run identifier and confirm that no matching records remain. Restore the original environment instance count after testing.
