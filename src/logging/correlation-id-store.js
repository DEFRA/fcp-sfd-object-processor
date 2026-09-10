import { AsyncLocalStorage } from 'node:async_hooks'

const asyncLocalStorage = new AsyncLocalStorage()

// enterWith transitions the current async context rather than nesting one, so the
// store outlives the caller (e.g. a hapi onRequest extension) and is still readable
// from later lifecycle stages such as the hapi-pino response log.
const enterCorrelationScope = () => {
  asyncLocalStorage.enterWith({ correlationId: undefined })
}

const setCorrelationId = (correlationId) => {
  const store = asyncLocalStorage.getStore()
  if (store) {
    store.correlationId = correlationId
  }
}

const runWithCorrelationId = (correlationId, fn) => {
  return asyncLocalStorage.run({ correlationId }, fn)
}

const getCorrelationId = () => {
  return asyncLocalStorage.getStore()?.correlationId
}

export {
  enterCorrelationScope,
  setCorrelationId,
  runWithCorrelationId,
  getCorrelationId
}
