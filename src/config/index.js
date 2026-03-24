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

// Backwards compatibility: if AUTH_ENTRA_TENANTS is not set but legacy single-tenant
// env vars are present, construct a single-entry tenants array so existing deployments keep working.
if (!process.env.AUTH_ENTRA_TENANTS && process.env.AUTH_ENTRA_TENANT_ID) {
  const tenantId = process.env.AUTH_ENTRA_TENANT_ID
  const allowedRaw = process.env.AUTH_ENTRA_ALLOWED_GROUP_IDS || ''
  const allowed = allowedRaw === '' ? [] : allowedRaw.split(',')
  config.set('auth.entra.tenants', [{ tenantId, allowedGroupIds: allowed }])
}

config.validate({ allowed: 'strict' })

export { config }
