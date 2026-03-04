---
name: Create Ticket from Context
description: Instructions for an AI agent to produce a consistent, human-friendly Jira ticket from user-provided context
rules: []
---

# Create a Jira Ticket from User Context

Instructions for an AI agent to produce a consistent, human-friendly Jira ticket from user-provided context, which may include text descriptions, images, file references, screenshots, logs, or any combination thereof.

---

## Model Selection

Before proceeding, **ask the user which model to use** for this task. Offer:
- `claude-sonnet-4.5` (Recommended) — Best for complex analysis, multimodal context, detailed reasoning
- `claude-haiku-4.5` — Fast, good for straightforward requests
- `gpt-5-mini` — Alternative option
- Let the user specify a different model if needed

---

## Inputs

Gather these before writing the ticket:

| Input | Required | Description |
|-------|----------|-------------|
| Context | Yes | User-provided information: can be text, images, screenshots, file excerpts, logs, error traces, links, or any combination |
| Description of desired outcome | Yes | What the user wants to achieve (feature request, bug fix, refactor, etc.) |
| File path(s) | If applicable | Specific files the context refers to |
| Repository / Service name | Yes | Repository or service name (if context involves code). Used to auto-derive repository URL. |
| Project key | Yes | Jira project key (e.g. `SFD2`) |

---

## Process

1. **Review the context** — Examine all provided material (text, images, file references, screenshots, etc.)
2. **Clarify ambiguities** — Ask the user follow-up questions if needed to understand intent, scope, or acceptance criteria
3. **Derive repository URL** — If a service/repository name is provided, automatically construct the URL as: `https://portal.cdp-int.defra.cloud/services/{service-name}` (use the service name exactly as provided)
4. **Map context to ticket fields** — Translate user context into a structured Jira ticket
5. **Generate the ticket** — Use the template below
6. **Review with user** — Present the ticket and ask for revisions before submission
7. **Create markdown file** — Save the reviewed ticket as a new markdown file (do NOT submit directly to Jira). The user can then review the file and submit it manually if approved.

---

## Ticket Template

Use the exact structure below. Replace placeholder text in `{braces}`.

### Title

```
[{PROJECT_KEY}] {Brief imperative description of the work needed}
```

Keep it under 80 characters. Start with a verb (e.g. *Fix*, *Add*, *Refactor*, *Update*, *Implement*, *Investigate*).

Good: `[SFD2] Fix file size validation in metadata processor`
Bad: `[SFD2] Something about file sizes`

---

### Description

Write four sections in this order:

#### 1. Main Goal

A single concise statement describing **what the ticket aims to achieve** and **why it matters** — the primary objective in SMART format. This should capture the "What" and "Why" of the work. Include measurable outcomes where applicable (e.g., performance improvements, reduction in errors, quality metrics).

```
**Main Goal:** {Action statement describing what will be accomplished}, {outcome/benefit statement with optional measurable impact}.
```

Examples:
- Refactor the legacy payment processing module to use the new API wrapper, reducing codebase complexity and decreasing checkout latency by 100ms.
- Implement user authentication via OAuth (Google/GitHub) to reduce login-related support tickets by 20% and improve user onboarding retention.
- Develop the GraphQL endpoint for user profile retrieval, reducing frontend data fetching time by 50%.
- Fix file size validation logic in metadata processor to prevent incorrect rejection of valid uploads.

Note: Measurable metrics (percentages, milliseconds, counts) are encouraged but optional.

#### 2. Source and Context

A short paragraph (2–4 sentences) explaining the **source of the request** and **key contextual information** extracted from what the user shared (images, logs, text, files, etc.).

```
**User Request:** {Brief summary of user's stated need}
**Source:** {Where the context came from — e.g. "User screenshot", "Error log", "Feature discussion", "Code excerpt", "Performance analysis"}
{If applicable: **File(s):** `{file_path}` (lines {start}–{end})}
{If applicable: **Repository:** {REPOSITORY_URL}}

{Summary of the key facts extracted from the user's context — what they shared and what was observed/identified}
```

#### 3. What needs to change

A numbered list of concrete, actionable steps. Each step should be specific enough for an engineer (or AI agent) to execute.

```
1. {In the context of X, do Y — reference specific files, functions, or endpoints if applicable}
2. {Next actionable step — be specific about what to modify, add, or remove}
3. {Any additional step — e.g. update tests, update documentation}
```

If the ticket involves investigation (vs. direct implementation), frame steps as research/discovery tasks:
```
1. Investigate {what condition/behaviour} in {which component/file}
2. Document findings in {where}
3. Propose solution based on findings
```

**For endpoint-related changes,** include input/output specifications:
```
1. {Create/Update/Modify} the {METHOD} {path} endpoint in {file}
   - **Input:** {Media type, schema, required fields, example payload}
   - **Output:** {Media type, schema, status codes, response shape, example}
   - {Any additional implementation detail}
2. {Update schema/validation/documentation}
3. {Add/update tests}
```

#### 4. Authoritative source (if applicable)

If the change relates to a best practice, security guideline, library API, or technical specification, include a link to the authoritative documentation.

```
**Reference:** {URL} — {one-line explanation of relevance}
```

Examples of good sources:
- Language/framework documentation (e.g. MDN, Node.js, Hapi docs)
- API specifications or vendor documentation
- OWASP guidelines (for security issues)
- Team ADRs or architecture docs
- RFCs or standards (e.g. RFC 7231 for HTTP semantics)

If no authoritative source applies, write: *No external reference required — based on user request and project context.*

---

### Acceptance Criteria

Write a checklist using Jira-compatible markdown. Each criterion must be independently verifiable.

```
* [ ] {Criterion 1 — observable behaviour or outcome}
* [ ] {Criterion 2}
* [ ] {Criterion N}
```

Rules:
- Minimum 3 criteria, maximum 7.
- Use "the system", "the function", "the endpoint", or "the application" as the subject — not "you" or "the developer".
- Every criterion should be testable with a clear pass/fail outcome.
- Base criteria on what the user explicitly or implicitly wants; include test/quality criteria.

Example:
```
* [ ] The error message is clear and actionable to end users
* [ ] The fix handles edge cases (e.g., null values, empty collections)
* [ ] Unit tests cover the new/changed behaviour
* [ ] No performance regression on standard workloads
* [ ] Code review feedback incorporated
```

---

### Testing Guide

A numbered checklist for verification in the **test environment** using external tools and manual testing. Assume the tester has access to the deployed environment but **has not** read all the context. This is about **exercising the system externally** — not unit tests.

**Important:** All testing must be performed in the test environment using independent tools (CURL, SQS messages, AWS CLI, Postman, etc.). Do NOT run or reference local unit tests, npm scripts, or Docker-based testing.

```
**Environment:** {Target environment — e.g. test, staging, production}
**Tool/Client:** {e.g. curl, AWS CLI, SQS client, Postman}
**Preconditions:** {Any setup needed in the test environment — e.g. test data, feature flags, authentication, queue subscriptions. Write "None" if none required.}

1. {Action — describe what to do in the test environment}
   **Command/payload:** `{example curl, SQS message, AWS CLI command, or manual action}`
   **Expected:** {Observable result — HTTP status code, response content, state change in the test system, queue message delivery, log output in test environment, etc.}
2. {Verification of an edge case or error condition}
   **Command/payload:** `{example}`
   **Expected:** {Expected error, status code, or behavior in the test environment}
3. {Any additional verification — e.g. check test environment logs, inspect database state, verify downstream message delivery}
   **Expected:** {What the tester should observe in the test environment}
```

Rules:
- Keep it to 3–6 steps.
- Include at least one happy path and one edge-case/error scenario.
- Provide concrete example commands or payloads — not prose descriptions.
- State expected outcomes explicitly — use specific HTTP status codes, response shapes, queue behavior, or observable side effects.
- All commands must target the test environment endpoints/queues/databases (provide specific test URLs/ARNs).
- **Do NOT include local unit test commands, npm scripts, or Docker-based testing.** This is for test environment QA only.

---

## Checklist Before Submitting

- [ ] Model was selected in conversation with user
- [ ] Title is concise, starts with a verb, and reflects the work requested
- [ ] Main Goal clearly states the primary objective with "what" and "why" (measurable outcomes if applicable)
- [ ] Source and Context section summarizes the user's input and source material
- [ ] "What needs to change" steps are specific and actionable (reference files/functions/endpoints if applicable)
- [ ] Acceptance criteria are independently verifiable and tied to user's intent
- [ ] Testing guide includes concrete examples and expected outcomes (with endpoint specifications for API changes)
- [ ] Authoritative references included or explicitly noted as not applicable
- [ ] User has reviewed and approved the ticket before submission

---

## Tips

- **If context is ambiguous**, ask clarifying questions rather than assuming.
- **If images are provided**, describe what you observe (errors, UI state, data) and tie it to the ticket's actionable steps.
- **If logs are provided**, extract key error messages, timestamps, or patterns that inform the ticket's scope.
- **If file excerpts are provided**, reference them by path and line number in acceptance criteria and testing guide.
- **For bugs**, frame "What needs to change" as investigation + fix, with focus on root cause and prevention.
- **For features**, frame as implementation steps with clear boundaries (in/out of scope).
