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
    }
  }
}
