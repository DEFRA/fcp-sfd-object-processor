import Joi from 'joi'
import { generateResponseSchemas } from '../../schemas/responses.js'

const metadataSuccessSchema = Joi.object({
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
        filename: Joi.string().required().description('Name of file uploaded by the user').example('my-potato-field.tiff'),
        contentType: Joi.string().required().description('Content type of the file uploaded').example('image/tiff'),
        fileStatus: Joi.string().required().description('Upload status of the file uploaded').example('complete'),
      }).required().description('File information'),

    }).label('uploadMetadata')
  ).label('uploadMetadataArray')
}).label('responseData')

export const metadataResponseSchema = generateResponseSchemas(metadataSuccessSchema)
