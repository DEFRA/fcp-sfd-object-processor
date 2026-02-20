import Joi from 'joi'
import { generateResponseSchemas } from '../../schemas/responses.js'
import { schemaConsts } from '../../../../constants/schemas.js'

const metadataSuccessSchema = Joi.object({
  data: Joi.array().items(
    Joi.object({
      _id: Joi.any().exist(), // update to support mongoId format or convert to string before returning

      metadata: Joi.object({
        sbi: Joi.number()
          .integer()
          .min(schemaConsts.SBI_MIN)
          .max(schemaConsts.SBI_MAX)
          .description('Single Business Identifier')
          .example(schemaConsts.SBI_EXAMPLE),
        crn: Joi.number()
          .integer()
          .min(schemaConsts.CRN_MIN)
          .max(schemaConsts.CRN_MAX)
          .description('Customer Reference Number')
          .example(schemaConsts.CRN_EXAMPLE),
        frn: Joi.number()
          .integer()
          .min(schemaConsts.FRN_MIN)
          .max(schemaConsts.FRN_MAX)
          .description('Firm Reference Number')
          .example(schemaConsts.FRN_EXAMPLE),
        submissionId: Joi.string()
          .description('ID for all files uploaded in request')
          .example(schemaConsts.SUBMISSION_ID_EXAMPLE),
        uosr: Joi.string()
          .description('Made up of sbi_submissionId')
          .example(schemaConsts.UOSR_EXAMPLE),
        submissionDateTime: Joi.string()
          .pattern(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/)
          .description('Date the uploads were made in DD/MM/YYYY HH:mm:ss format')
          .example(schemaConsts.SUBMISSION_DATE_TIME_EXAMPLE),
        files: Joi.array()
          .items(Joi.string().required())
          .required()
          .description('Array of filenames')
          .example(schemaConsts.FILES_EXAMPLE),
        filesInSubmission: Joi.number()
          .integer()
          .positive()
          .required()
          .description('Size of the file in bytes')
          .example(schemaConsts.FILES_IN_SUBMISSION_EXAMPLE),
        type: Joi.string()
          .description('Name of the CRM queue the uploads should be tagged with')
          .example(schemaConsts.TYPE_EXAMPLE),
        reference: Joi.string()
          .description('A user entered reference to describe the uploads')
          .example(schemaConsts.REFERENCE_EXAMPLE),
        service: Joi.string()
          .description('Name of the service that provided the uploads')
          .example(schemaConsts.SERVICE_EXAMPLE)
      }).required().label('MetadataFields').description('Metadata about the item'),

      file: Joi.object({
        fileId: Joi.string()
          .guid({ version: 'uuidv4' })
          .required()
          .description('UUIDv4 identifier')
          .example(schemaConsts.FILE_ID_EXAMPLE),
        filename: Joi.string()
          .required()
          .description('Name of file uploaded by the user')
          .example(schemaConsts.FILENAME_EXAMPLE),
        contentType: Joi.string()
          .required()
          .description('Content type of the file uploaded')
          .example(schemaConsts.CONTENT_TYPE_EXAMPLE),
        fileStatus: Joi.string()
          .required()
          .description('Upload status of the file uploaded')
          .example(schemaConsts.FILE_STATUS_EXAMPLE)
      }).required().label('FileFields').description('File information')

    }).label('MetadataDocument')
  )
}).label('MetadataQueryResponse')

export const metadataResponseSchema = generateResponseSchemas(metadataSuccessSchema)
