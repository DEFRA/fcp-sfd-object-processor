# Session 2 Quiz — The Transactional Outbox Pattern & Authentication

> 8 questions covering Session 2 topics.
> Questions are ordered from easiest to hardest — warm up the room before the brain-teasers!
> Mix of multiple-choice and true/false.
> **Facilitator tip:** Hide the answers section before sharing with attendees!

---

## Questions

---

### ⭐ Warm-up (Q1–Q2)

**Q1 (True/False)**
When a new outbox entry is created, its initial status is `PENDING`.

- A) True
- B) False

---

**Q2 (True/False)**
Authentication is disabled by default in the service — you must explicitly opt in per route.

- A) True
- B) False

---

### ⭐⭐ Getting Going (Q3–Q4)

**Q3 (Multiple Choice)**
Which two JWT authentication strategies does the service support?

- A) Google OAuth 2.0 and GitHub OAuth
- B) Microsoft Entra ID (Azure AD) and AWS Cognito
- C) AWS Cognito and Okta OIDC
- D) Microsoft Entra ID and Auth0

---

**Q4 (Multiple Choice)**
What is the maximum number of messages published in a single SNS `PublishBatch` call?

- A) 1
- B) 5
- C) 10
- D) 100

---

### ⭐⭐⭐ Thinking Required (Q5–Q6)

**Q5 (Multiple Choice)**
What value is used as the SNS message `id` field, and why?

- A) A randomly generated UUID — to make every message unique
- B) The MongoDB `_id` of the outbox entry — to link back to the database record
- C) The `fileId` — to allow downstream services to deduplicate repeated deliveries
- D) The `correlationId` — to group related events in the same submission

---

**Q6 (Multiple Choice)**
In what order does the `validate()` function check an incoming JWT? Put the following steps in the correct sequence:

1. Check that the token's `typ` claim is `JWT` or `at+jwt`
2. Check that the allowed list (groups or client IDs) is non-empty
3. Check that the token belongs to the allowed list
4. Return `{ isValid: true, credentials }`

- A) 3 → 2 → 1 → 4
- B) 1 → 3 → 2 → 4
- C) 2 → 1 → 3 → 4
- D) 1 → 2 → 3 → 4

---

### ⭐⭐⭐⭐ Deep End (Q7–Q8)

**Q7 (True/False)**
The transactional outbox pattern guarantees **exactly-once** delivery of SNS messages.

- A) True
- B) False

---

**Q8 (Multiple Choice)**
The service has both Entra ID and Cognito authentication enabled. A request arrives carrying a valid Cognito token. The Entra strategy validates first and rejects the token (wrong issuer). What does Hapi do next?

- A) Returns `401 Unauthorized` immediately — the first strategy to reject wins
- B) Skips all remaining strategies and returns `403 Forbidden`
- C) Tries the Cognito strategy; if it accepts the token, the request succeeds
- D) Logs a warning and falls back to `auth: false` for that request

---

## Answers

| # | Difficulty | Answer | Explanation |
|---|---|---|---|
| 1 | ⭐ | **A — True** | Outbox entries are inserted with `status: PENDING` in `createOutboxEntries()`. They move to `SENT` on successful SNS publish or `FAILED` on error. |
| 2 | ⭐ | **B — False** | `server.auth.default(...)` applies authentication **globally**. Individual routes must explicitly set `auth: false` to opt out (currently only `/health` and `/api/v1/callback`). |
| 3 | ⭐⭐ | **B** | The service supports Microsoft Entra ID (Azure AD) and AWS Cognito, enabled independently via `AUTH_ENTRA_ENABLED` and `AUTH_COGNITO_ENABLED`. |
| 4 | ⭐⭐ | **C** | `BATCH_SIZE = 10` (defined in `src/constants/outbox.js`), matching the AWS SNS `PublishBatch` API hard limit of 10 messages per call. |
| 5 | ⭐⭐⭐ | **C** | `id` is set to `fileId`. This allows CRM (and any other downstream consumer) to detect and safely discard duplicate messages if the outbox processor re-delivers after a crash. |
| 6 | ⭐⭐⭐ | **D** | The order is: (1) check token type → (2) check allowed list is configured → (3) check token is in the allowed list → (4) return valid credentials. Each step short-circuits with a `401` if it fails. |
| 7 | ⭐⭐⭐⭐ | **B — False** | The outbox guarantees **at-least-once** delivery. If the service crashes after publishing to SNS but before updating the outbox status, the entry remains `PENDING` and will be published again on the next poll cycle. Idempotency is the consumer's responsibility (using `fileId` as the deduplication key). |
| 8 | ⭐⭐⭐⭐ | **C** | When multiple strategies are registered, Hapi tries each in order. A rejection by one strategy does not fail the request — Hapi continues to the next strategy. The request succeeds as long as **any** registered strategy accepts the token. |

