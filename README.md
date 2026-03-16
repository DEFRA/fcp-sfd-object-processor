# fcp-sfd-object-processor

![Publish](https://github.com/defra/fcp-sfd-object-processor/actions/workflows/publish.yml/badge.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_fcp-sfd-object-processor&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_fcp-sfd-object-processor)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_fcp-sfd-object-processor&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_fcp-sfd-object-processor)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_fcp-sfd-object-processor&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_fcp-sfd-object-processor)

This service is part of the [Single Front Door (SFD) project](https://github.com/DEFRA/fcp-sfd-core).

The object processor is a REST API and messaging gateway for the Single Front Door (SFD) service, providing endpoints to persist and retrieve metadata relating to uploaded files to support the Single Front Door project.

The service works alongside the [CDP Uploader](https://github.com/DEFRA/cdp-uploader). If the upload request to the CDP Uploader is made using the object processor as the callback route the service receives the payload and persists the metadata to the database. Using the [Transactional Outbox pattern](https://microservices.io/patterns/data/transactional-outbox.html), the service publishes events to AWS SNS topics. These events include metadata intended to be pushed to CRM and to the FCP audit service.

## Features

- Persist metadata after upload ✅
- Retrieve metadata about uploaded files ✅
- Push metadata to CRM (in progress) 🏗️

## Prerequisites

- Docker
- Docker Compose
- Node.js (v22 LTS)

### SonarQube Cloud token

One of the `pre-commit` hooks configured for this service enables code scanning by SonarQube Cloud. This will look for any issues before committing. This pre-commit hook has been enabled to ensure fewer issues are pushed to GitHub leading to earlier resolution of existing vulnerabilities. In order for this pre-commit hook to run successfully during local development you will need to generate your own personal `SONAR_TOKEN` and add it to your `.env`.

- Log into [SonarQube Cloud](https://sonarcloud.io/login).
- On the left-hand sidebar navigate to the `Security` tab.
- Under `Generate Tokens` enter a name for your token and click `Generate Token`.
- Copy the token and add it to your `.env`, referring to it as [`SONAR_TOKEN`](.env.example).

## Pre-commit Hooks

For local development, this repository includes [`pre-commit` hooks](https://pre-commit.com/). These hooks allow for early identification of issues and vulnerabilities so that the developer can resolve any issues before pushing up to the public repository on GitHub. The hooks include:

- [`detect-secrets`](https://github.com/Yelp/detect-secrets): for detecting and preventing secrets in the codebase being pushed to public/open-source repositories.
- `eslint-fix`: a custom hook for running the linter, ESLint + [neostandard](https://www.npmjs.com/package/neostandard?activeTab=readme), to ensure consistent code formatting and styling and additionally uses the `--fix` option to automatically fix any identified issues where possible to reduce the need for manual correction.
- `sonarqube-cloud-scan`: a custom hook which runs the official [SonarScanner CLI Docker image](https://hub.docker.com/r/sonarsource/sonar-scanner-cli) enabling code scanning by SonarQube Cloud for early identification of issues, bugs, vulnerabilities etc., reducing the number of failed builds in upstream CI pipelines. 

To see the full output of the above hooks it is recommended to commit via the command line as using the source control panel does not provide the same feedback and loses sight of the `pre-commit` logs. All `pre-commit` hooks are listed in the [`.pre-commit-config.yaml`](.pre-commit-config.yaml) configuration file.

For these hooks to successfully apply during local development ensure  Python and its package manager, `pip3`, are installed on your machine. Installation of `pre-commit` can then be completed via `pip3`:

```
pip3 install pre-commit
```

> Note: The `sonarqube-cloud-scan` hook will typically take around 2 minutes to run.

## Running the application

We recommend using the [fcp-sfd-core](https://github.com/DEFRA/fcp-sfd-core) repository for local development. You can however run this service independently by following the instructions below using either Docker Compose or the provided [npm scripts](./package.json). Alternatively, for VS Code users, a set of [VS Code tasks](.vscode/tasks.json) are available to use and can be access via the command palette: 

- `Ctrl` + `shift` + `P` on Windows or `Cmd` + `shift` + `P` on Mac.
- Select `Tasks: Run Task`.
- Choose from the available tasks listed.

### Build container image

Container images are built using Docker Compose.

```
docker compose build
```

Alternatively, an npm script is available:

```
npm run docker:build
```

### Start

Use Docker Compose to start running the service locally.

```
docker compose up
```

Alternatively, an npm script is available:

```
npm run docker:dev
```

### Documentation

The service uses `hapi-swagger` to auto generate OpenAPI spec available on the [`/documentation`](http://localhost:3004/documentation) endpoint when running the service locally.

A static OpenAPI specification can be found in the `docs/openapi` folder.

To update the static OpenAPI specification file in the `docs` folder please use the npm script `generateOpenApiSpec` when the server is running locally:

```
npm run generateOpenApiSpec
```

This can be used to generate up-to-date information in a OpenAPI specification file which can be pushed to Github and shared with stakeholders.

## Using the service

Once the service is running locally, the REST API can be used to interact with the CDP uploader and also retrieve information regarding blobs, metadata and specific SBIs. Below is a series of cURL commands that will enable these interactions. 

For any developers who prefer to use a GUI such as Postman, there is a [Postman collection available to use](https://github.com/DEFRA/fcp-sfd-core/blob/main/resources/postman/fcp-sfd-object-processor.postman_collection.json).

As mentioned, all API interactions available (including the possible responses) are described in detail via the `/documentation` endpoint.

### Making a request to the CDP Uploader

When using the service for local development, it's recommended to first `POST` a request to the CDP Uploader using the service as the call back route. This is so that existing information is available from which various `GET` requests can be made. 

```
curl -X POST "http://localhost:3004/api/v1/callback" \
-H "Content-Type: application/json" \
-d '{
  "uploadStatus": "ready",
  "metadata": {
    "sbi": 123456789,
    "crn": 1234567890,
    "frn": 1102658375,
    "submissionId": "0987654321",
    "uosr": "123456789_0987654321",
    "submissionDateTime": "10/12/2024 10:25:12",
    "files": ["test-file.pdf"],
    "filesInSubmission": 1,
    "type": "CS_Agreement_Evidence",
    "reference": "user entered reference",
    "service": "fcp-sfd-frontend"
  },
  "form": {
    "file1": {
      "fileId": "aa0bd0ce-e254-40b4-84b6-f5acded17fe8",
      "filename": "test-file.pdf",
      "contentType": "application/pdf",
      "fileStatus": "complete",
      "contentLength": 102400,
      "checksumSha256": "dGVzdGNoZWNrc3Vt",
      "detectedContentType": "application/pdf",
      "s3Key": "uploads/test-file.pdf",
      "s3Bucket": "test-bucket"
    }
  },
  "numberOfRejectedFiles": 0
}'
```

### Retrieve a file

After uploading a file/files, we can retrieve information about an individual file using its `fileId`. From the previous step, this would be `aa0bd0ce-e254-40b4-84b6-f5acded17fe8`.

```
curl -X GET "http://localhost:3004/api/v1/blob/aa0bd0ce-e254-40b4-84b6-f5acded17fe8"
```

### Retrieve metadata

Metadata relating to a given SBI (Single Business Identifier) can be retrieved by providing the SBI in question. In this case, from the previous examples this would be `123456789`.

```
curl -X GET "http://localhost:3004/api/v1/metadata/sbi/123456789"
```

### Retrieve file status

After uploading a file via the CDP Uploader using the object processor as the callback route, the status of the file can be seen by providing the `correlationId`. The status can also be seen directly in the database and it's from the database the `correlationId` can be retrieved. [MongoDB Compass](https://www.mongodb.com/products/tools/compass) is the official GUI for interacting with local MongoDB instances. When accessing the `status` collection, the documents in there will appear as shown below.

```
{
  "_id": {
    "$oid": "69b152a122fb223fe73d1c28"
  },
  "correlationId": "ab32fd43-5e10-4eab-aff9-83522ca91042", # this is the correlationId
  "sbi": 123456789,
  "fileId": "aa0bd0ce-e254-40b4-84b6-f5acded17fe8",
  "timestamp": {
    "$date": "2026-03-11T11:31:45.078Z"
  },
  "validated": true,
  "errors": null
}
```

With this `correlationId` noted, the status can be retrieved by submitting a `GET` request.

```
curl -X GET "http://localhost:3004/api/v1/status/{correlationId}" # where {correlationId} is ab32fd43-5e10-4eab-aff9-83522ca91042
```

The information returned will be the same as what is stored in the database.

## Tests


### Test structure

The tests have been structured into sub-folders of `./test` as per the
[Microservice test approach and repository structure](https://eaflood.atlassian.net/wiki/spaces/FPS/pages/1845396477/Microservice+test+approach+and+repository+structure). 

Test mocks and sample payloads used by unit and integration tests are documented in the [mocks README](test/mocks/README.md).

### Running tests

A convenience npm script is provided to run automated tests in a containerised
environment. This will rebuild images before running tests via Docker Compose,
using a combination of the `compose.yaml` and `compose.test.yaml` files.

```
npm run docker:test
```

Tests can also be started in watch mode to support Test Driven Development (TDD):

```
npm run docker:test:watch
```

As mentioned previously, Docker Compose can be used directly for starting tests:

```
docker compose -f compose.yaml -f compose.test.yaml run --rm "fcp-sfd-object-processor"
```

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of His Majesty's Stationery Office (HMSO) to enable information providers in the public sector to license the use and re-use of their information under a common open licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
