import { writeFile } from 'node:fs/promises'

const generateOpenapi = async (path = './src/docs/openapi/v1.json') => {
  try {
    const openApiResponse = await fetch('http://localhost:3004/documentation.json')
    const openApiJson = await openApiResponse.json()
    await writeFile(path, JSON.stringify(openApiJson, null, 2))
    console.log(`OpenAPI documentation generated successfully at ${path}`)
  } catch (error) {
    const errorMessage = error.cause?.code === 'ECONNREFUSED'
      ? 'Failed to connect to the server. Please ensure the server is running before generating the OpenAPI documentation.'
      : `Failed to generate OpenAPI documentation: ${error.message}`
    throw new Error(errorMessage)
  }
}

generateOpenapi()
