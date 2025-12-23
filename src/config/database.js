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
