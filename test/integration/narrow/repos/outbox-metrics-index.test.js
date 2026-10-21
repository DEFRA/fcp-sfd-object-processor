import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { config } from '../../../../src/config/index.js'
import { getDb, connectDb, closeDb, createIndexes } from '../../../../src/data/db.js'
import { PENDING, PROCESSING, SENT, PERMANENT_FAILURE } from '../../../../src/constants/outbox.js'
import { buildPendingOutboxCountCursor, buildOldestPendingOutboxCursor } from '../../../../src/repos/outbox.js'

const INDEX_NAME = 'outbox_status_createdAt_idx'

const originalCollectionName = config.get('mongo.collections.outbox')
const collectionName = `${originalCollectionName}-metrics-index-integration`

let db
let collection

// Collects every stage in a plan tree, including SORT_MERGE inputs and nested queryPlan wrappers.
const collectStages = (node, stages = []) => {
  if (!node) return stages
  stages.push({ stage: node.stage, indexName: node.indexName })
  const children = node.inputStages ?? (node.inputStage ? [node.inputStage] : [])
  children.forEach(child => collectStages(child, stages))
  return stages
}

const winningStages = (explain) => {
  const plan = explain.queryPlanner.winningPlan
  return collectStages(plan.queryPlan ?? plan)
}

const expectIndexOnlyPlan = (explain) => {
  const stages = winningStages(explain)
  const scans = stages.filter(s => s.stage === 'IXSCAN')

  expect(stages.map(s => s.stage)).not.toContain('COLLSCAN')
  expect(scans.length).toBeGreaterThan(0)
  scans.forEach(scan => expect(scan.indexName).toBe(INDEX_NAME))
}

beforeAll(async () => {
  await connectDb()
  db = getDb()
  config.set('mongo.collections.outbox', collectionName)
  collection = db.collection(collectionName)

  await collection.drop().catch(() => { })
  await createIndexes()

  const statuses = [PENDING, PROCESSING, SENT, PERMANENT_FAILURE]
  const now = Date.now()
  await collection.insertMany(Array.from({ length: 2000 }, (_, i) => ({
    status: statuses[i % statuses.length],
    attempts: i % 3,
    createdAt: new Date(now - i * 1000),
    claimedUntil: new Date(now)
  })))
})

afterAll(async () => {
  await collection.drop().catch(() => { })
  config.set('mongo.collections.outbox', originalCollectionName)
  await closeDb()
})

describe('outbox pending metrics queries', () => {
  test('oldest pending createdAt query uses outbox_status_createdAt_idx without fetching documents', async () => {
    const explain = await buildOldestPendingOutboxCursor(collection).explain('executionStats')

    expectIndexOnlyPlan(explain)
    expect(explain.executionStats.totalDocsExamined).toBe(0)
  })

  test('pending count aggregation uses outbox_status_createdAt_idx without fetching documents', async () => {
    const explain = await buildPendingOutboxCountCursor(collection).explain('executionStats')
    // Aggregation explain nests the query plan under stages[0].$cursor; the shape can vary by MongoDB version.
    const cursorStage = explain.stages?.[0]?.$cursor ?? explain

    expectIndexOnlyPlan(cursorStage)
    expect(cursorStage.executionStats.totalDocsExamined).toBe(0)
  })
})
