export const authConfig = {
  auth: {
    enabled: {
      doc: 'API authentication enabled',
      format: Boolean,
      default: true,
      env: 'AUTH_ENABLED'
    },
    tenant: {
      doc: 'Azure tenant ID to authenticate clients',
      format: String,
      default: 'replace-with-tenant-id',
      nullable: false,
      env: 'AUTH_TENANT_ID'
    },
    allowedGroupIds: {
      doc: 'Security Group object IDs allowed to access the API, comma separated',
      format: 'security-group-array',
      default: [],
      nullable: false,
      env: 'AUTH_ALLOWED_GROUP_IDS'
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
        nullable: true,
        default: null,
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
