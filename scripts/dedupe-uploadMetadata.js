#!/usr/bin/env node
import { MongoClient } from 'mongodb'

// Usage:
// MONGO_URI="mongodb://..." MONGO_DB="db" node scripts/dedupe-uploadMetadata.js --collection=uploadMetadata --fix

const argv = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [k, v] = arg.split('=')
  return [k.replace(/^--/, ''), v === undefined ? true : v]
}))

const uri = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://localhost:27017'
const dbName = process.env.MONGO_DB || process.env.MONGO_DATABASE || 'fcp-sfd-object-processor'
const collectionName = argv.collection || 'uploadMetadata'
const doFix = !!argv.fix

const client = await MongoClient.connect(uri, { connectTimeoutMS: 10000 })
const db = client.db(dbName)
const col = db.collection(collectionName)

try {
  console.log(`Connected to ${uri} -> ${dbName}.${collectionName}`)

  const dupAgg = [
    { $group: { _id: '$file.fileId', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
    { $project: { fileId: '$_id', count: 1, ids: 1 } }
  ]

  const duplicates = await col.aggregate(dupAgg).toArray()

  if (duplicates.length === 0) {
    console.log('No duplicate file.fileId values found')
    process.exit(0)
  }

  console.log(`Found ${duplicates.length} duplicate fileId(s):`)
  for (const d of duplicates) {
    console.log(`- ${d.fileId} (count=${d.count})`)
  }

  if (!doFix) {
    console.log('\nRun with --fix to remove duplicates (keeps the earliest inserted document)')
    process.exit(0)
  }

  console.log('\nRemoving duplicates (keeping one document per fileId)')

  for (const d of duplicates) {
    // Keep the first _id (assumed earliest); delete the rest
    const [keepId, ...removeIds] = d.ids
    if (!removeIds || removeIds.length === 0) continue

    const res = await col.deleteMany({ _id: { $in: removeIds } })
    console.log(`Removed ${res.deletedCount} docs for fileId=${d.fileId}`)
  }

  console.log('Duplicate removal complete')
} catch (err) {
  console.error('Error:', err)
  process.exitCode = 2
} finally {
  await client.close()
}
