export const hapiSwaggerConfig = {
  info: {
    title: 'FCP SFD Object Processor API',
    version: '0.0.1',
    description: 'API for FCP Single Front Door Object Processor. Supporting integration with CDP uploader service, retrieving metadata and forwarding data to CRM.',
    contact: {
      name: 'SFD Devs',
      url: 'https://github.com/orgs/DEFRA/teams/fcp-sfd-devs'
    }
  },
  cors: false,
  documentationPath: '/documentation',
  grouping: 'tags',
  jsonPath: '/documentation.json',
  OAS: 'v3.0',
  deReference: true,
  servers: [
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
  ],
  tags: [
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
