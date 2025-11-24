export const hapiSwaggerConfig = {
  hapiSwagger: {
    info: {
      title: {
        doc: 'API title for the Swagger documentation',
        format: String,
        default: 'FCP SFD Object Processor API'
      },
      version: {
        doc: 'API version',
        format: String,
        default: '0.0.1'
      },
      description: {
        doc: 'Description of the API',
        format: String,
        default:
        'API for FCP Single Front Door Object Processor. Supporting integration with CDP uploader service, retrieving metadata and forwarding data to CRM.'
      },
      contact: {
        name: {
          doc: 'Contact name for the API maintainers',
          format: String,
          default: 'SFD Devs'
        },
        url: {
          doc: 'Contact URL for the API maintainers',
          format: String,
          default: 'https://github.com/orgs/DEFRA/teams/fcp-sfd-devs'
        }
      }
    },
    cors: {
      doc: 'Enable/disable CORS',
      format: Boolean,
      default: false
    },
    documentationPath: {
      doc: 'Path where documentation will be served',
      format: String,
      default: '/documentation'
    },
    grouping: {
      doc: 'How endpoints are grouped in Swagger UI',
      format: String,
      default: 'tags'
    },
    jsonPath: {
      doc: 'Path where JSON documentation will be served',
      format: String,
      default: '/documentation.json'
    },
    OAS: {
      doc: 'OpenAPI Specification version',
      format: ['v2', 'v3.0'],
      default: 'v3.0'
    },
    deReference: {
      doc: 'Whether to dereference JSON schemas',
      format: Boolean,
      default: true
    },
    servers: {
      doc: 'List of server configurations',
      format: Array,
      default: [
        {
          url: 'http://localhost:3004',
          description: 'local server'
        },
        {
          url: 'https://fcp-sfd-object-processor.dev.cdp-int.defra.cloud',
          description: 'CDP Dev environment'
        },
        {
          url: 'https://fcp-sfd-object-processor.test.cdp-int.defra.cloud',
          description: 'CDP Test environment'
        },
        {
          url: 'https://fcp-sfd-object-processor.perf-test.cdp-int.defra.cloud',
          description: 'CDP Perf-Test environment'
        },
        {
          url: 'https://fcp-sfd-object-processor.prod.cdp-int.defra.cloud',
          description: 'CDP Prod environment'
        }
      ]
    },
    tags: {
      doc: 'List of tags used for grouping endpoints in documentation',
      format: Array,
      default: [
        {
          name: 'health',
          description: 'Health check endpoint'
        },
        {
          name: 'cdp-uploader',
          description: 'Operations supporting the CDP Uploader callback.'
        },
        {
          name: 'metadata',
          description: 'Operations supporting object processor metadata'
        }
      ]
    }
  }
}
