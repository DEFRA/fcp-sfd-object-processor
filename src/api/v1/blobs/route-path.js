import { config } from '../../../config/index.js'

// Kept apart from the route module so consumers such as the auth plugin can match on the path
// without pulling in the handler's database and S3 dependencies.
export const blobRoutePath = `${config.get('baseUrl.v1')}/blob/{fileId}`
