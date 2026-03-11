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

## Tests


### Test structure

The tests have been structured into subfolders of `./test` as per the
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
