import { describe, test, expect } from 'vitest'
import db from '../../../../src/data/db-client.js'

describe('Create Mongo client', () => {
  test('should return an instance of database client', async () => {
    expect(db).toBeDefined()
    expect(db.s.namespace.db).toBe('fcp-sfd-object-processor')
    expect(db.databaseName).toBe('fcp-sfd-object-processor')
  })

  test('should have a connected MongoDB client', async () => {
    expect(db.client).toBeDefined()
    expect(db.client.topology.isConnected()).toBe(true)
  })

  test('db client should be able to upload data to collection', async () => {
    const uploadResult = await db.collection('test').insertOne({ test: 'test' })
    expect(uploadResult.acknowledged).toBe(true)
  })

  test('db client should be able to retrieve from collection', async () => {
    const queryResult = await db.collection('test').findOne({ test: 'test' })
    expect(queryResult.test).toBe('test')
  })
})
