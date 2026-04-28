# Session 1 Quiz — Basics & API Endpoints

> 8 questions to test understanding of Session 1 topics.
> Mix of multiple-choice and true/false.
> **Facilitator tip:** Hide the answers section before sharing with attendees!

---

## Questions

---

**Q1 (Multiple Choice)**
What is the primary purpose of `fcp-sfd-object-processor`?

- A) A user-facing frontend for submitting grant applications
- B) A messaging gateway that receives CDP Uploader callbacks, persists metadata, and publishes SNS events
- C) A virus scanner that checks uploaded files before sending them to S3
- D) A CRM integration service that creates support cases directly

---

**Q2 (Multiple Choice)**
Which JWT token providers does the service currently support for authentication?

- A) Google OAuth 2.0 only
- B) AWS Cognito only
- C) Microsoft Entra ID (Azure AD) only
- D) Both Microsoft Entra ID (Azure AD) and AWS Cognito

---

**Q3 (True/False)**
The `POST /api/v1/callback` endpoint requires a valid Bearer token.

- A) True
- B) False

---

**Q4 (Multiple Choice)**
What HTTP status code does a **successful** callback response return?

- A) 200 OK
- B) 201 Created
- C) 204 No Content
- D) 202 Accepted

---

**Q5 (True/False)**
When querying `GET /api/v1/metadata/sbi/{sbi}`, SBIs must be provided as strings in the URL and will be matched as strings in the database.

- A) True
- B) False

---

**Q6 (Multiple Choice)**
What does `GET /api/v1/blob/{fileId}` return?

- A) The raw binary content of the file
- B) A list of metadata documents for the given file
- C) A pre-signed S3 URL for direct file download
- D) A virus scan report for the uploaded file

---

**Q7 (Multiple Choice)**
Which endpoint must a frontend service call **first** to start a new upload session?

- A) `POST /api/v1/callback`
- B) `GET /api/v1/uploader/status/{uploadId}`
- C) `POST /api/v1/uploader/initiate`
- D) `GET /api/v1/blob/{fileId}`

---

**Q8 (True/False)**
When authentication is enabled, all routes in the service require a valid Bearer token by default — you must explicitly opt out with `auth: false`.

- A) True
- B) False

---

## Answers

| # | Answer | Explanation |
|---|---|---|
| 1 | **B** | The service is a messaging gateway: it receives CDP Uploader callbacks, stores file metadata in MongoDB, and publishes upload events to SNS for the CRM system. |
| 2 | **D** | Both strategies are supported and can be enabled independently via `AUTH_ENTRA_ENABLED` and `AUTH_COGNITO_ENABLED` environment variables. |
| 3 | **B — False** | The callback endpoint has `auth: false` because CDP Uploader is an external service that cannot present a token. |
| 4 | **B** | A successful callback returns `201 Created` with `{ message, count, ids }`. |
| 5 | **B — False** | The URL parameter (a string) is converted to an integer with `parseInt()` before the database query, because SBIs are stored as integers in MongoDB. |
| 6 | **C** | The blob endpoint looks up the S3 coordinates for the file and returns a time-limited pre-signed URL for direct download. |
| 7 | **C** | `POST /api/v1/uploader/initiate` proxies to CDP Uploader, enriches the request with server-side config, and returns `uploadId` + URLs for the next steps. |
| 8 | **A — True** | `server.auth.default(...)` applies authentication globally. Routes that must be public (health, callback) explicitly set `auth: false`. |
