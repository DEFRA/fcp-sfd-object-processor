# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Service Does

REST API and messaging gateway for the Single Front Door (SFD) project. Receives file upload metadata callbacks from CDP Uploader, persists to MongoDB, and publishes events to AWS SNS using the **Transactional Outbox pattern**.

Data flow: CDP Uploader scans files → uploads to S3 → calls `/api/v1/callback` → service persists metadata + outbox entries in a single transaction → background processor publishes batches to SNS → CRM service consumes events.

## Commands

```bash
# Development (Docker-based, recommended)
npm run docker:dev              # Start service with all dependencies
npm run docker:dev:d            # Start detached
npm run docker:debug            # Start with debug port (9229) exposed

# Testing
npm run docker:test             # Lint + full test suite in Docker (CI-equivalent)
npm run docker:test:watch       # Watch mode in Docker
npm test                        # Local tests (requires local MongoDB with replica set)
npm run test:watch              # Local watch mode

# Linting
npm run lint                    # ESLint with neostandard
npm run lint:fix                # ESLint with auto-fix

# Run a single test file
npx vitest run test/unit/path/to/file.test.js
```

## Architecture

```
src/api/          → Routes, handlers, Joi schemas (call services, never repos)
src/services/     → Business logic, orchestrates repos, manages MongoDB transactions
src/repos/        → Database operations (accept session parameter for transactions)
src/data/         → MongoDB client
src/messaging/    → SNS publishing (outbound/) and client (sns/)
src/config/       → Convict-based config split by concern (server, database, auth, aws, uploader)
src/plugins/      → Hapi plugins (auth via Microsoft Entra ID JWT)
```

### Key Patterns

- **Transactional Outbox**: Data writes and outbox entries happen in the same MongoDB transaction. Background processor polls outbox and publishes batches (size 10) to SNS. Never bypass this pattern.
- **Authentication**: Microsoft Entra ID (Azure AD) JWT via `@hapi/jwt`. Applied by default on all routes; disabled with `auth: false` only for `/health` and `/api/v1/callback`.
- **SNS messages**: CloudEvents v1.0 format. Contract in `docs/asyncapi/v1.yaml`.

## Tech Stack

- Node.js v22+ with ESM (`type: "module"` — always use `.js` extensions in imports)
- Hapi.js framework
- MongoDB 7+ with replica sets (required for transactions)
- Vitest (NOT Jest) — use `vi.fn()`, `vi.mock()`
- neostandard ESLint config
- AWS SDK v3 (S3, SNS)
- Convict for configuration

## Testing Conventions

- **Unit tests**: `test/unit/` — mock dependencies
- **Integration tests**: `test/integration/narrow/` — real MongoDB
- **Shared mocks**: `test/mocks/` — reuse these, especially `cdp-uploader.js` and `base-data.js`
- Never mock `mongodb` directly — mock `src/data/db.js` instead
- Integration tests must set a unique collection name in `beforeAll` and clean up in `afterAll`
- Use `server.inject()` for API testing (call `server.initialize()` first)

## Logging

ECS (Elastic Common Schema) format via Pino. All structured fields **must** be nested under `event.*` or `error.*` — flat top-level fields are invisible on the platform. Log builder utilities live in `src/utils/` (e.g. `build-uploader-status-log.js`). Duration values must be in nanoseconds (`ms × 1_000_000`).

## Adding New Endpoints

1. Create Joi schema in `src/api/v1/{feature}/schema.js`
2. Create handler in `src/api/v1/{feature}/index.js`
3. Add service function if orchestrating multiple repos
4. Register route in `src/api/router.js`
5. Add unit + integration tests
