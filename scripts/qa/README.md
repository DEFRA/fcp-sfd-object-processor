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
4. Obtain an authorised `mongosh` connection using the team's approved method.
5. Set `OUTBOX_QA_RECORD_COUNT` to more than twice the environment's `MONGO_OUTBOX_QUERY_LIMIT`; use at least `250` when the limit is `100`.
6. Run `scripts/qa/outbox-concurrency.mongosh.js` against the `fcp-sfd-object-processor` database and record the printed test-run identifier.

The script does not require CDP Terminal, MongoDB Compass or any other specific execution environment. CDP Terminal may be used only if it provides the required `mongosh` access and permissions.

## Inspect the result

The script prints inspection queries containing the exact test-run identifier. Run them in the same database. Also inspect structured application logs for that test period.

Verify that:

- at least two distinct worker identifiers claim records from the test run;
- no record has overlapping valid claim ownership;
- non-expired claims are not taken by another worker;
- finalisation is performed only by the current claim owner;
- successfully published records reach `SENT`;
- no record remains indefinitely in `PROCESSING`.

If practical, stop or redeploy one instance after it claims records. After the lease expires, verify that another worker reclaims them and that the previous owner cannot finalise them.

Compose scheduling does not guarantee that both local workers receive records. The default volume makes participation likely, but the worker IDs in the logs are the evidence. Repeat with a larger record count if only one worker participates.

Capture the instance count, worker identifiers, test-run identifier, relevant structured logs and final MongoDB status counts as evidence.

## Clean up

Cleanup is restricted to records carrying one explicit, non-empty test-run identifier. Copy the exact identifier printed during insertion and provide the required confirmation.

Local container example:

```sh
docker compose -f compose.yaml -f compose.override.yaml -f compose.qa.yaml exec -T mongodb mongosh "mongodb://localhost:27017/fcp-sfd-object-processor?replicaSet=rs0" --eval 'globalThis.OUTBOX_QA_MODE="cleanup"; globalThis.OUTBOX_QA_TEST_RUN_ID="outbox-qa-local-001"; globalThis.OUTBOX_QA_CONFIRM_CLEANUP="DELETE outbox-qa-local-001"' /qa/outbox-concurrency.mongosh.js
```

The script reports the number of deleted `outbox` and `uploadMetadata` records. Query both collections using the test-run identifier and confirm that no matching records remain. Restore the original environment instance count after testing.
