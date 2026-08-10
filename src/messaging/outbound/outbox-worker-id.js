import { randomUUID } from 'node:crypto'

const outboxWorkerId = process.env.NODE_INSTANCE_ID || process.env.HOSTNAME || randomUUID()

export { outboxWorkerId }
