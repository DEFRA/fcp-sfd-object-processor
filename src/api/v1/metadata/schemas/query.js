import Joi from 'joi'

import { config } from '../../../../config/index.js'
import { schemaConsts } from '../../../../constants/schemas.js'

export const metadataQuerySchema = Joi.object({
  pageSize: Joi.number()
    .integer()
    .min(1)
    .max(config.get('mongo.metadataSbiMaxPageSize'))
    .default(config.get('mongo.metadataSbiPageSize'))
    .description('Maximum number of records to return in this page')
    .example(schemaConsts.PAGE_SIZE_EXAMPLE),
  after: Joi.string()
    .hex()
    .length(schemaConsts.CURSOR_LENGTH)
    .description('page.nextCursor from the previous response; returns the records older than it')
    .example(schemaConsts.CURSOR_EXAMPLE)
}).label('MetadataQuery')
