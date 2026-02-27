export const databaseConfig = {
  mongo: {
    uri: {
      doc: 'URI for mongodb',
      format: String,
      default: 'mongodb://127.0.0.1:27017/',
      env: 'MONGO_URI'
    },
    database: {
      doc: 'database for mongodb',
      format: String,
      default: 'fcp-sfd-object-processor',
      env: 'MONGO_DATABASE'
    },
    readPreference: {
      doc: 'MongoDB read preference (primary, secondary, etc), needs to be primary in local development as we use a single mongo node replica set. For production, we are using secondary for read operations to reduce load on primary.',
      format: String,
      default: null,
      env: 'MONGO_READ_PREFERENCE'
    },
    outboxQueryLimit: {
      doc: 'Limit for number of outbox entries to query at once',
      format: 'int',
      default: 100,
      env: 'MONGO_OUTBOX_QUERY_LIMIT'
    },
    collections: {
      uploadMetadata: {
        doc: 'collection for enriched metadata about files including s3 location. This collection is populated by the callback endpoint and read by the outbox processor to send messages to CRM',
        format: String,
        default: 'uploadMetadata'
      },
      status: {
        doc: 'collection for status of inbound document requests including payload validation and cdp-uploader result',
        format: String,
        default: 'status'
      },
      outbox: {
        doc: 'collection for storing pending outbound messages to be processed and sent to external systems',
        format: String,
        default: 'outbox'
      }
    }
  }
}
