/* global db, ObjectId, print */

// NON-PRODUCTION QA TOOLING ONLY.
// Connection details must be supplied to mongosh; this script contains none.

const readConfiguration = (name) => {
  const value = globalThis[name]
  return typeof value === 'string' ? value.trim() : value
}
const defaultRecordCount = 250
const recordCount = Number.parseInt(readConfiguration('OUTBOX_QA_RECORD_COUNT') ?? `${defaultRecordCount}`, 10)
const requestedTestRunId = readConfiguration('OUTBOX_QA_TEST_RUN_ID')
const configuredMode = readConfiguration('OUTBOX_QA_MODE')
const mode = typeof configuredMode === 'string' ? configuredMode.toLowerCase() : 'insert'

const generateUuid = () => {
  const first = new ObjectId().toString()
  const second = new ObjectId().toString()

  return `${first.slice(0, 8)}-${first.slice(8, 12)}-4${first.slice(13, 16)}-8${first.slice(17, 20)}-${first.slice(20, 24)}${second.slice(0, 8)}`
}

const generatedTestRunId = `outbox-qa-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${new ObjectId()}`
const testRunId = requestedTestRunId || generatedTestRunId

const assertSafeTestRunId = () => {
  if (!testRunId || testRunId.length < 8) {
    throw new Error('OUTBOX_QA_TEST_RUN_ID must contain at least 8 characters')
  }
}

const printInspectionQueries = () => {
  print('Inspection queries:')
  print(`db.outbox.aggregate([{ $match: { qaTestRunId: "${testRunId}" } }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { _id: 1 } }])`)
  print(`db.outbox.find({ qaTestRunId: "${testRunId}" }, { status: 1, attempts: 1, claimedBy: 1, claimedAt: 1, claimedUntil: 1, lastAttemptedAt: 1 }).sort({ createdAt: 1 })`)
  print(`db.uploadMetadata.countDocuments({ qaTestRunId: "${testRunId}" })`)
}

const cleanUp = () => {
  assertSafeTestRunId()

  const expectedConfirmation = `DELETE ${testRunId}`
  if (readConfiguration('OUTBOX_QA_CONFIRM_CLEANUP') !== expectedConfirmation) {
    throw new Error(`Cleanup refused. Set OUTBOX_QA_CONFIRM_CLEANUP exactly to: ${expectedConfirmation}`)
  }

  const outboxResult = db.outbox.deleteMany({ qaTestRunId: testRunId })
  const metadataResult = db.uploadMetadata.deleteMany({ qaTestRunId: testRunId })

  print(`Cleaned QA test run: ${testRunId}`)
  print(`Deleted outbox records: ${outboxResult.deletedCount}`)
  print(`Deleted metadata records: ${metadataResult.deletedCount}`)
}

const buildMetadata = (index, fileId, correlationId) => {
  const sequence = String(index + 1).padStart(6, '0')

  return {
    qaTestRunId: testRunId,
    metadata: {
      sbi: Number(`105${sequence}`),
      crn: Number(`1050${sequence}`),
      frn: Number(`1102${sequence}`),
      submissionId: `${testRunId}-${sequence}`,
      uosr: `${testRunId}-${sequence}`,
      type: 'CS_Agreement_Evidence',
      reference: `Outbox concurrency QA ${testRunId} record ${index + 1}`,
      service: 'SFD-QA'
    },
    file: {
      fileId,
      filename: `outbox-concurrency-${testRunId}-${sequence}.pdf`,
      contentType: 'application/pdf',
      fileStatus: 'complete'
    },
    s3: {
      key: `qa/${testRunId}/${fileId}.pdf`,
      bucket: 'qa-placeholder-not-for-download'
    },
    messaging: {
      publishedAt: null,
      correlationId
    },
    raw: {
      uploadStatus: 'complete',
      numberOfRejectedFiles: 0
    }
  }
}

const insertTestData = () => {
  assertSafeTestRunId()

  if (!Number.isSafeInteger(recordCount) || recordCount < 1) {
    throw new Error('OUTBOX_QA_RECORD_COUNT must be a positive integer')
  }

  if (db.outbox.countDocuments({ qaTestRunId: testRunId }) > 0 ||
      db.uploadMetadata.countDocuments({ qaTestRunId: testRunId }) > 0) {
    throw new Error(`Test-run identifier already exists: ${testRunId}`)
  }

  const metadataRecords = Array.from({ length: recordCount }, (_, index) => {
    return buildMetadata(index, generateUuid(), generateUuid())
  })
  const metadataResult = db.uploadMetadata.insertMany(metadataRecords)
  const insertedMetadataIds = Object.values(metadataResult.insertedIds)
  const outboxRecords = insertedMetadataIds.map((messageId, index) => ({
    qaTestRunId: testRunId,
    messageId,
    payload: metadataRecords[index],
    status: 'PENDING',
    attempts: 0,
    createdAt: new Date()
  }))
  const outboxResult = db.outbox.insertMany(outboxRecords)

  print('NON-PRODUCTION QA TOOLING')
  print(`Test-run identifier: ${testRunId}`)
  print(`Inserted metadata records: ${Object.keys(metadataResult.insertedIds).length}`)
  print(`Inserted outbox records: ${Object.keys(outboxResult.insertedIds).length}`)
  printInspectionQueries()
}

if (mode === 'cleanup') {
  cleanUp()
} else if (mode === 'insert') {
  insertTestData()
} else {
  throw new Error('OUTBOX_QA_MODE must be either insert or cleanup')
}
