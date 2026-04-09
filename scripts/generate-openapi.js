import { writeFile } from 'node:fs/promises'
import { schemaConsts } from '../src/constants/schemas.js'

/**
 * Generates OpenAPI specification by fetching from the running server
 * and applying minimal post-processing for security scheme naming.
 *
 * Prerequisites:
 * - Server must be running on http://localhost:3004
 * - hapi-swagger plugin must be registered and configured
 *
 * Post-processing steps:
 * 1. Rename security scheme from 'entra' (auth strategy name) to 'bearerAuth' (OpenAPI convention)
 * 2. Update security requirements on all paths to use 'bearerAuth'
 */
const generateOpenapi = async (outputPath = './docs/openapi/v1.json') => {
  const serverUrl = 'http://localhost:3004'
  const documentationEndpoint = `${serverUrl}/documentation.json`

  try {
    // Fetch OpenAPI spec from running server
    console.log(`🔍 Fetching OpenAPI specification from ${documentationEndpoint}...`)
    const response = await fetch(documentationEndpoint)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const spec = await response.json()

    // Post-process 1: Rename security scheme from 'entra' to 'bearerAuth'
    // This is necessary because hapi-swagger uses the Hapi auth strategy name,
    // but OpenAPI convention is to use descriptive names like 'bearerAuth'
    if (spec.components?.securitySchemes?.entra) {
      spec.components.securitySchemes.bearerAuth = spec.components.securitySchemes.entra
      delete spec.components.securitySchemes.entra

      // Update security requirements in all paths
      Object.values(spec.paths || {}).forEach(pathItem => {
        Object.values(pathItem).forEach(operation => {
          if (operation.security) {
            operation.security = operation.security.map(requirement => {
              if (requirement.entra) {
                return { bearerAuth: requirement.entra }
              }
              return requirement
            })
          }
        })
      })
    }

    // Post-process 2: Inject FileUpload component and ensure CallbackForm includes it
    // This schema is nested in Joi.alternatives().try() so hapi-swagger doesn't extract it
    if (!spec.components) {
      spec.components = {}
    }
    if (!spec.components.schemas) {
      spec.components.schemas = {}
    }

    // Always inject FileUpload schema if missing
    if (!spec.components.schemas.FileUpload) {
      spec.components.schemas.FileUpload = {
        type: 'object',
        description: 'File upload metadata from CDP Uploader',
        properties: {
          fileId: {
            type: 'string',
            description: 'Unique identifier for the uploaded file',
            example: '9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
            format: 'uuid'
          },
          filename: {
            type: 'string',
            description: 'Original name of the uploaded file',
            example: 'document.pdf',
            minLength: 1
          },
          contentType: {
            type: 'string',
            description: 'MIME type of the uploaded file',
            example: 'application/pdf',
            pattern: '^[a-zA-Z0-9][a-zA-Z0-9!#$&^_+-]*/[a-zA-Z0-9][a-zA-Z0-9!#$&^_+.-]*$'
          },
          fileStatus: {
            type: 'string',
            description: 'Status of the file upload',
            example: 'complete',
            enum: ['complete']
          },
          contentLength: {
            type: 'integer',
            description: 'Size of the file in bytes',
            example: 11264,
            minimum: 0
          },
          checksumSha256: {
            type: 'string',
            description: 'SHA-256 checksum of the file encoded in base64',
            example: 'bng5jOVC6TxEgwTUlX4DikFtDEYEc8vQTsOP0ZAv21c=',
            pattern: '^[A-Za-z0-9+/]+=*$'
          },
          detectedContentType: {
            type: 'string',
            description: 'MIME type detected by virus scanning',
            example: 'application/pdf',
            pattern: '^[a-zA-Z0-9][a-zA-Z0-9!#$&^_+-]*/[a-zA-Z0-9][a-zA-Z0-9!#$&^_+.-]*$'
          },
          s3Key: {
            type: 'string',
            description: 'S3 object key where the file is stored',
            example: 'scanned/folder/9fcaabe5-77ec-44db-8356-3a6e8dc51b13',
            minLength: 1
          },
          s3Bucket: {
            type: 'string',
            description: 'S3 bucket name where the file is stored',
            example: 'fcp-sfd-object-processor-bucket',
            minLength: 1
          }
        },
        required: [
          'fileId',
          'filename',
          'contentType',
          'fileStatus',
          'contentLength',
          'checksumSha256',
          'detectedContentType',
          's3Key',
          's3Bucket'
        ]
      }
    }

    // Ensure CallbackForm schema includes FileUpload as additionalProperties if missing
    const cbForm = spec.components.schemas.CallbackForm
    if (cbForm && (!cbForm.properties || Object.keys(cbForm.properties).length === 0)) {
      // Add x-meta to indicate additionalProperties is FileUpload
      cbForm.type = 'object'
      cbForm.description = 'Form data containing both text fields and file uploads'
      cbForm.additionalProperties = { $ref: '#/components/schemas/FileUpload' }
      // Optionally, add x-meta for downstream tools if needed
      cbForm['x-meta'] = {
        additionalProperties: {
          oneOf: [
            { type: 'string' },
            { $ref: '#/components/schemas/FileUpload' }
          ]
        }
      }
    }

    // Post-process: Inject named examples for uploader status 200 response.
    // hapi-swagger only renders a single schema-level `example`; OAS 3.0
    // supports named `examples` at the media-type level which Swagger UI
    // presents as a dropdown.
    const statusMediaType =
      spec.paths?.['/api/v1/uploader/status/{uploadId}']?.get?.responses?.['200']?.content?.['application/json']

    if (statusMediaType) {
      const metadata = {
        sbi: schemaConsts.SBI_EXAMPLE,
        crn: schemaConsts.CRN_EXAMPLE,
        frn: schemaConsts.FRN_EXAMPLE,
        submissionId: schemaConsts.SUBMISSION_ID_EXAMPLE,
        uosr: schemaConsts.UOSR_EXAMPLE,
        type: schemaConsts.TYPE_EXAMPLE,
        reference: schemaConsts.REFERENCE_EXAMPLE,
        service: schemaConsts.SERVICE_EXAMPLE
      }

      const baseFileFields = {
        fileId: schemaConsts.FILE_ID_EXAMPLE,
        filename: schemaConsts.FILENAME_EXAMPLE,
        contentType: schemaConsts.CONTENT_TYPE_EXAMPLE,
        detectedContentType: schemaConsts.DETECTED_CONTENT_TYPE_EXAMPLE
      }

      statusMediaType.examples = {
        success: {
          summary: 'All files uploaded successfully',
          value: {
            data: {
              uploadStatus: 'success',
              metadata,
              form: {
                'file-upload-1': {
                  ...baseFileFields,
                  fileStatus: 'complete',
                  contentLength: schemaConsts.CONTENT_LENGTH_EXAMPLE,
                  checksumSha256: schemaConsts.CHECKSUM_SHA256_EXAMPLE,
                  s3Key: schemaConsts.S3_KEY_EXAMPLE,
                  s3Bucket: schemaConsts.S3_BUCKET_EXAMPLE
                }
              }
            }
          }
        },
        failure: {
          summary: 'One or more files rejected',
          value: {
            data: {
              uploadStatus: 'failure',
              metadata,
              form: {
                'file-upload-1': {
                  ...baseFileFields,
                  fileStatus: 'rejected',
                  hasError: true,
                  errorMessage: schemaConsts.ERROR_MESSAGE_EXAMPLE
                }
              }
            }
          }
        },
        pending: {
          summary: 'Upload still processing',
          value: {
            data: {
              uploadStatus: 'pending',
              metadata,
              form: {
                'file-upload-1': {
                  ...baseFileFields,
                  fileStatus: 'pending'
                }
              }
            }
          }
        }
      }
    }

    // Write to file
    await writeFile(outputPath, JSON.stringify(spec, null, 2))

    // Success feedback
    console.log('✅ OpenAPI specification generated successfully')
    console.log(`   📄 Output: ${outputPath}`)
    console.log('   🔒 Security: bearerAuth scheme configured')
    console.log('   📦 Components: FileUpload schema injected')
    console.log('   📝 Examples: uploader status response examples injected')
    console.log(`   📊 Total schemas: ${Object.keys(spec.components?.schemas || {}).length}`)
    console.log(`   🛣️  Paths: ${Object.keys(spec.paths || {}).length} endpoints`)
  } catch (error) {
    // Enhanced error messages for common issues
    if (error.cause?.code === 'ECONNREFUSED') {
      console.error(`❌ Connection refused to ${serverUrl}`)
      console.error('   Please ensure the server is running: npm start')
    } else if (error.message.includes('HTTP 404')) {
      console.error('❌ Documentation endpoint not found')
      console.error(`   Verify hapi-swagger is configured at: ${documentationEndpoint}`)
    } else {
      console.error('❌ Failed to generate OpenAPI documentation')
      console.error(`   Error: ${error.message}`)
    }

    throw error
  }
}

generateOpenapi()
