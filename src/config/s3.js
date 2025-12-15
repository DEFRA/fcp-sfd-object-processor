export const s3Config = {
  s3: {
    region: {
      doc: 'AWS region, required for s3 client',
      format: String,
      default: 'eu-west-2',
      env: 'AWS_REGION'
    },
    localstack: {
      endpoint: {
        doc: 'endpoint to use to reach the s3 storage when using localstack ',
        format: String,
        default: 'http://localstack:4566',
        // will changing this impact the s3 local functionality
      },
      forcePathStyle: {
        doc: 'Sets the presigned url path to use a defined endpoint instead of the default aws endpoint ',
        format: Boolean,
        default: true,
      },
      credentials: {
        accessKeyId: {
          doc: 'Test access keyfor using s3 client with localstack',
          format: String,
          default: 'test',
        },
        secretAccessKey: {
          doc: 'Test secret access keyfor using s3 client with localstack',
          format: String,
          default: 'test',
        }
      }
    }
  }
}
