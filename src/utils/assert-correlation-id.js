// Guards the persistence path against an implicitly minted correlation id.
//
// A default such as `correlationId = randomUUID()` would put an identifier into the
// database that corresponds to no upload journey and appears in no log, leaving the
// record impossible to trace back to its initiate request. Callers must therefore supply
// one explicitly, and a missing value fails loudly here rather than being written.
//
// See docs/adr/0001-explicit-correlation-id-on-the-persistence-path.md
export const assertCorrelationId = (correlationId, context) => {
  if (typeof correlationId !== 'string' || correlationId.trim() === '') {
    throw new Error(`${context} requires an explicit correlationId`)
  }
}
