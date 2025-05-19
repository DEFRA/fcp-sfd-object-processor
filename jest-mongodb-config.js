export default {
  mongodbMemoryServerOptions: {
    binary: {
      skipMD5: true
    },
    autoStart: false,
    instance: {
      dbName: 'fcp-sfd-object-processor'
    }
  },
  mongoURLEnvName: 'MONGO_URI',
  useSharedDBForAllJestWorkers: false
}
