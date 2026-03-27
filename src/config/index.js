import convict from 'convict'

import { serverConfig } from './server.js'
import { uploaderConfig } from './uploader.js'
import { databaseConfig } from './database.js'
import { hapiSwaggerConfig } from './hapi-swagger.js'
import { awsConfig } from './aws.js'
import { authConfig } from './auth.js'

import { securityGroupArray } from './formats/entra-security-groups.js'
import { entraTenantsArray } from './formats/entra-tenants-array.js'
import { cognitoClientIdArray } from './formats/cognito-client-ids.js'
import { endpointPath } from './formats/endpoint-path.js'
import { mimeTypeArray } from './formats/mime-types.js'

convict.addFormat(securityGroupArray)
convict.addFormat(entraTenantsArray)
convict.addFormat(cognitoClientIdArray)
convict.addFormat(endpointPath)
convict.addFormat(mimeTypeArray)

const config = convict({
  ...serverConfig,
  ...uploaderConfig,
  ...databaseConfig,
  ...hapiSwaggerConfig,
  ...awsConfig,
  ...authConfig
})

// Backwards compatibility: if `auth.entra.tenants` is empty but legacy single-tenant
// configuration is set (exposed via the schema), construct a single-entry tenants
// array so existing deployments keep working. Using `config.get()` means validation
// errors will reference the original env vars (e.g. `AUTH_ENTRA_ALLOWED_GROUP_IDS`).
// Backwards compatibility for legacy single-tenant environment variables
// has been removed. `auth.entra.tenants` should be set via the
// `AUTH_ENTRA_TENANTS` environment variable (JSON array) or programmatically.

config.validate({ allowed: 'strict' })

export { config }
