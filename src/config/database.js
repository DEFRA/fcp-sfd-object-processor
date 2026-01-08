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
    collections: {
      uploadMetadata: {
        doc: 'uploadMetadata collection',
        format: String,
        default: 'uploadMetadata'
      },
      outbox: {
        doc: 'outbox collection for storing pending outbound messages',
        format: String,
        default: 'outbox'
      }
    }
  }
}
