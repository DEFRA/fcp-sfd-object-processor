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

### Configuration

## Running the application

We recommend using the [fcp-sfd-core](https://github.com/DEFRA/fcp-sfd-core) repository for local development. You can however run this service independently by following the instructions below.

### Build container image

Container images are built using Docker Compose, with the same images used to run the service with either Docker Compose or Kubernetes.

When using the Docker Compose files in development the local `app` folder will
be mounted on top of the `app` folder within the Docker container, hiding the CSS files that were generated during the Docker build.  For the site to render correctly locally `npm run build` must be run on the host system.


By default, the start script will build (or rebuild) images so there will
rarely be a need to build images manually. However, this can be achieved
through the Docker Compose
[build](https://docs.docker.com/compose/reference/build/) command:
```
# Build container images
docker-compose build
```

### Start

Use Docker Compose to run service locally.

```
docker-compose up --build
```

### Documentation
The service uses hapi-swagger to auto generate Openapi spec available on the `/documentation` endpoint when running the service locally.

A static Openapi specification can be found in the `src/docs` folder.

To update the static openapi json in the `docs` folder please use the npm script `generateOpenApiSpec` when the server is running locally. This can be used to generate an upto date openapi spec which can be pushed to github and shared with stakeholders.

## Tests

### Test structure

The tests have been structured into subfolders of `./test` as per the
[Microservice test approach and repository structure](https://eaflood.atlassian.net/wiki/spaces/FPS/pages/1845396477/Microservice+test+approach+and+repository+structure)

### Running tests

A convenience npm script is provided to run automated tests in a containerised
environment. This will rebuild images before running tests via docker-compose,
using a combination of `compose.yaml` and `compose.test.yaml`.

To run the tests:
```
npm run docker:test
```

You can also run the tests directly using docker compose:
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