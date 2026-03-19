import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const SONARCLOUD_BASE_URL = 'https://sonarcloud.io'
const BORDER = '═'.repeat(51)

const parseDotEnv = async (filePath) => {
  const vars = {}
  try {
    const content = await readFile(filePath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '')
      vars[key] = value
    }
  } catch {
    // .env file not found or unreadable — continue with process.env only
  }
  return vars
}

const parseSonarProperties = async (filePath) => {
  const props = {}
  const content = await readFile(filePath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    props[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim()
  }
  return props
}

const runScanner = (sonarToken, cwd) =>
  new Promise((resolve, reject) => {
    const args = [
      'run',
      '--rm',
      '--name',
      'sonar-scan',
      '-v',
      `${cwd}:/usr/src`,
      '-e',
      `SONAR_TOKEN=${sonarToken}`,
      'sonarsource/sonar-scanner-cli',
      '-Dsonar.issuesReport.console.enable=true',
      '-Dsonar.qualitygate.wait=true'
    ]

    const child = spawn('docker', args, { stdio: 'inherit' })

    child.on('error', reject)
    // Always resolve with the exit code — a non-zero exit may simply mean the
    // quality gate failed (analysis was still uploaded). We check the gate
    // status via the API after the scan and exit accordingly.
    child.on('close', resolve)
  })

const sonarcloudFetch = async (path, sonarToken) => {
  const url = `${SONARCLOUD_BASE_URL}${path}`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sonarToken}`
    }
  })
  if (!response.ok) {
    throw new Error(`SonarCloud API error ${response.status}: ${response.statusText} (${url})`)
  }
  return response.json()
}

const fetchQualityGate = (projectKey, sonarToken) =>
  sonarcloudFetch(
    `/api/qualitygates/project_status?projectKey=${encodeURIComponent(projectKey)}`,
    sonarToken
  )

const fetchMeasures = (projectKey, sonarToken) =>
  sonarcloudFetch(
    `/api/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=new_violations,accepted_issues,security_hotspots,new_coverage,new_duplicated_lines_density`,
    sonarToken
  )

const getMeasureValue = (measures, key) => {
  const measure = measures.find((m) => m.metric === key)
  if (!measure) return 'N/A'
  // "new code" metrics are returned under periods[0].value rather than value
  return measure.value ?? measure.periods?.[0]?.value ?? 'N/A'
}

const formatPercent = (value) => (value === 'N/A' ? 'N/A' : `${parseFloat(value).toFixed(1)}%`)

// Pad a label+value pair to align values in the same column
const row = (label, value) => ` ${`  ${label}`.padEnd(28)}${value}`

const printSummary = (qualityGate, measuresResponse, projectKey) => {
  const measures = measuresResponse.component?.measures ?? []
  const status = qualityGate.projectStatus?.status

  const passed = status === 'OK'
  const statusLabel = passed ? '✅ PASSED' : status === 'WARN' ? '⚠️  WARN' : '❌ FAILED'

  // Issues
  const newIssues = getMeasureValue(measures, 'new_violations')
  const acceptedIssues = getMeasureValue(measures, 'accepted_issues')

  // Measures
  const securityHotspots = getMeasureValue(measures, 'security_hotspots')
  const coverageOnNew = formatPercent(getMeasureValue(measures, 'new_coverage'))
  const duplicationOnNew = formatPercent(getMeasureValue(measures, 'new_duplicated_lines_density'))

  const dashboardUrl = `${SONARCLOUD_BASE_URL}/summary/overall?id=${encodeURIComponent(projectKey)}`

  console.log(`\n${BORDER}`)
  console.log(` SonarCloud Quality Gate: ${statusLabel}`)
  console.log(BORDER)
  console.log(' Issues')
  console.log(row('New Issues:', newIssues))
  console.log(row('Accepted Issues:', acceptedIssues))
  console.log(' Measures')
  console.log(row('Security Hotspots:', securityHotspots))
  console.log(row('Coverage on New Code:', coverageOnNew))
  console.log(row('Duplication on New Code:', duplicationOnNew))
  console.log(BORDER)
  console.log(` 🔗 ${dashboardUrl}`)
  console.log(`${BORDER}\n`)

  return passed || status === 'WARN'
}

const sonarScan = async () => {
  const cwd = resolve('.')

  // Load .env if present (mirrors `source .env` from the old npm script)
  const envPath = resolve(cwd, '.env')
  const envVars = existsSync(envPath) ? await parseDotEnv(envPath) : {}
  const sonarToken = envVars.SONAR_TOKEN ?? process.env.SONAR_TOKEN

  if (!sonarToken) {
    console.error(
      'Error: SONAR_TOKEN is not set. Add it to your .env file or set it as an environment variable.'
    )
    process.exit(1)
  }

  // Read project config from sonar-project.properties
  const propsPath = resolve(cwd, 'sonar-project.properties')
  const props = await parseSonarProperties(propsPath)
  const projectKey = props['sonar.projectKey']

  if (!projectKey) {
    console.error('Error: sonar.projectKey not found in sonar-project.properties')
    process.exit(1)
  }

  // Run the scanner — resolves with exit code (0 = success, non-zero = quality
  // gate failed or scan error). We always attempt to fetch the summary.
  const scanCode = await runScanner(sonarToken, cwd)

  // Fetch quality gate + metrics and print summary
  let qualityGate, measuresResponse
  try {
    ;[qualityGate, measuresResponse] = await Promise.all([
      fetchQualityGate(projectKey, sonarToken),
      fetchMeasures(projectKey, sonarToken)
    ])
  } catch (apiErr) {
    // API fetch failed — the scan likely didn't upload (e.g. auth error, network)
    if (scanCode !== 0) {
      console.error(`\nSonar scanner exited with code ${scanCode}. No results to display.`)
      process.exit(scanCode)
    }
    throw apiErr
  }

  const passed = printSummary(qualityGate, measuresResponse, projectKey)

  if (!passed) {
    process.exit(1)
  }
}

sonarScan().catch((err) => {
  console.error(`\nSonar scan failed: ${err.message}`)
  process.exit(1)
})
