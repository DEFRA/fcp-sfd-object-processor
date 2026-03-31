export const authConfig = {
  auth: {
    entra: {
      enabled: {
        doc: 'Entra ID authentication enabled',
        format: Boolean,
        default: true,
        env: 'AUTH_ENTRA_ENABLED'
      },
      // Multi-tenant configuration: an array of tenant objects
      // Example JSON environment variable:
      // AUTH_ENTRA_TENANTS='[{"tenantId":"defra-dev-tenant-id","allowedGroupIds":["group-a"]},{"tenantId":"defra-tenant-id","allowedGroupIds":["group-b"]}]'
      tenants: {
        doc: 'Array of Entra tenant configs (tenantId + allowedGroupIds)',
        format: 'entra-tenants-array',
        default: [],
        nullable: false,
        env: 'AUTH_ENTRA_TENANTS'
      }
    },
    cognito: {
      enabled: {
        doc: 'AWS Cognito authentication enabled',
        format: Boolean,
        default: false,
        env: 'AUTH_COGNITO_ENABLED'
      },
      tokenUrl: {
        doc: 'AWS Cognito OAuth2 token endpoint URL',
        format: String,
        nullable: true,
        default: null,
        env: 'AUTH_COGNITO_TOKEN_URL'
      },
      userPoolId: {
        doc: 'AWS Cognito User Pool identifier',
        format: String,
        nullable: false,
        default: '',
        env: 'AUTH_COGNITO_USER_POOL_ID'
      },
      clientIds: {
        doc: 'Authorized Cognito app client IDs, comma separated',
        format: 'cognito-client-id-array',
        default: [],
        nullable: false,
        env: 'AUTH_COGNITO_CLIENT_IDS'
      }
    }
  }
}
