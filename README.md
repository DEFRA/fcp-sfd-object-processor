# fcp-sfd-object-processor

![Publish](https://github.com/defra/fcp-sfd-object-processor/actions/workflows/publish.yml/badge.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_fcp-sfd-object-processor&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_fcp-sfd-object-processor)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_fcp-sfd-object-processor&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_fcp-sfd-object-processor)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_fcp-sfd-object-processor&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_fcp-sfd-object-processor)

This service is part of the [Single Front Door (SFD) service](https://github.com/DEFRA/fcp-sfd-core).

REST API Object processor for the Single Front Door (SFD) service. This service provides endpoints to persist and retrieve metadata relating to uploaded files to support the Single Front Door project.

The service works alongside the [CDP Uploader](https://github.com/DEFRA/cdp-uploader). If the upload request to the CDP Uploader is made using the object processor as the callback route the service receives the payload and persists the metadata to the database.

## Features

- Persist metadata after upload ✅
- Retrieve metadata about uploaded files ✅
- Push metadata to CRM (in progress) 🏗️


## Prerequisites

- Docker
- Docker Compose
- Node.js (v22 LTS)

## Running the application

We recommend using the [fcp-sfd-core](https://github.com/DEFRA/fcp-sfd-core) repository for local development. You can however run this service independently by following the instructions below.

### Build container image

Container images are built using Docker Compose.

```
docker compose build
```

### Start

Use Docker Compose to start running the service locally.

```
docker compose up
```

### Documentation

The service uses `hapi-swagger` to auto generate OpenAPI spec available on the [`/documentation`](http://localhost:3004/documentation) endpoint when running the service locally.

A static Openapi specification can be found in the `src/docs` folder.

To update the static OpenAPI specification file in the `docs` folder please use the npm script `generateOpenApiSpec` when the server is running locally:

```
npm run generateOpenApiSpec
```

This can be used to generate up-to-date information in a OpenAPI specification file which can be pushed to Github and shared with stakeholders.

## Using the service

Once the service is running locally, the REST API can be used to interact with the CDP uploader and also retrieve information regarding blobs, metadata and specific SBIs. Below is a series of cURL commands that will enable these interactions. As mentioned, all API interactions available (including the possible responses) are described in detail via the `/documentation` endpoint.

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

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of His Majesty's Stationery Office (HMSO) to enable information providers in the public sector to license the use and re-use of their information under a common open licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
