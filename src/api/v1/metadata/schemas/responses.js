import Joi from 'joi'

const metadataResponseSchema = Joi.object({
  data: Joi.array().items(
    Joi.object({
      _id: Joi.any().exist(), // update to support mongoId format ro convert to string before returning

      metadata: Joi.object({
        sbi: Joi.string().description('Single Business Identifier').example('105000000'),
        crn: Joi.string().description('Customer Reference Number').example('1050000000'),
        frn: Joi.string().description('Firm Reference Number').example('1102658375'),
        submissionId: Joi.string().description('ID for all files uploaded in request').example('1733826312'),
        uosr: Joi.string().description('Made up of sbi_submissionId').example('107220150_1733826312'),
        submissionDateTime: Joi.string().description('Date the uploads were made').example('10/12/2024 10:25:12'),
        files: Joi.array().items(Joi.string().required()).required().description('Array of filenames').example(['107220150_1733826312_SBI107220150.pdf']),
        filesInSubmission: Joi.number().integer().positive().required().description('Size of the file in bytes').example(2),
        type: Joi.string().description('Name of the CRM queue the uploads should be tagged with').example('CS_Agreement_Evidence'),
        reference: Joi.string().description('A user entered reference to describe the uploads').example('SFI evidence Oct 25'),
        service: Joi.string().description('Name of the service that provided the uploads').example('SFD')
      }).required().description('Metadata about the item'),

      file: Joi.object({
        fileId: Joi.string().guid({ version: 'uuidv4' }).required().description('UUIDv4 identifier').example('9fcaabe5-77ec-44db-8356-3a6e8dc51b13'),
        filename: Joi.string().required().description('Name of file uploaded by the user').example('my-potato-field.jpeg'),
        contentType: Joi.string().required().description('Content type of the file uploaded').example('image/jpeg'),
        fileStatus: Joi.string().required().description('Upload status of the file uploaded').example('complete'),
      }).required().description('File information'),

    }).label('uploadMetadata')
  ).label('uploadMetadataArray')
}).label('responseData')

const badRequestResponseSchema = Joi.object({
  statusCode: Joi.number().example(400),
  error: Joi.string().example('Bad Request'),
  message: Joi.string().example('Invalid query parameter'),
  validation:
      Joi.object({
        source: Joi.string(),
        keys: Joi.array().items(Joi.string())
      })
}).label('BadRequest')

const notfoundResponseSchema = Joi.object({
  statusCode: Joi.number().example(404),
  error: Joi.string().example('Not found'),
  message: Joi.string().example('Not found'),
}).label('NotFound')

const serverErrorResponseSchema = Joi.object({
  statusCode: Joi.number().example(500),
  error: Joi.string().example('Internal Server Error'),
  message: Joi.string().example('Something went wrong'),
}).label('ServerError')

export const rawDataSchema = Joi.object({
  fileId: Joi.string().guid({ version: 'uuidv4' }).required().description('UUIDv4 identifier').example('9fcaabe5-77ec-44db-8356-3a6e8dc51b13'),
  filename: Joi.string().required().description('Name of file uploaded by the user').example('my-potato-field.jpeg'),
  contentType: Joi.string().required().description('Content type of the file uploaded').example('image/jpeg'),
  fileStatus: Joi.string().required().description('Upload status of the file uploaded').example('complete'),
  contentLength: Joi.number().integer().positive().required().description('Size of the file in bytes').example(11264),
  checksumSha256: Joi.string().required().description('SHA-256 checksum of the file, Base64 encoded').example('bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c='),
  detectedContentType: Joi.string().required().description('MIME type detected for the uploaded file').example('image/jpeg'),
  s3Key: Joi.string().required().description('S3 object key').example('3b0b2a02-a669-44ba-9b78-bd5cb8460253/9fcaabe5-77ec-44db-8356-3a6e8dc51b13'),
  s3Bucket: Joi.string().required().description('Name of the S3 bucket where the file is stored').example('cdp-example-node-frontend')
}).required().description('Raw data object')

export const s3Schema = Joi.object({
  key: Joi.string().required().description('S3 object key').example('3b0b2a02-a669-44ba-9b78-bd5cb8460253/9fcaabe5-77ec-44db-8356-3a6e8dc51b13'),
  bucket: Joi.string().required().description('Name of the S3 bucket where the file is stored').example('cdp-example-node-frontend')
}).required().description('S3 storage information')

export const responseSchemas = {
  200: metadataResponseSchema,
  400: badRequestResponseSchema,
  404: notfoundResponseSchema,
  500: serverErrorResponseSchema
}
