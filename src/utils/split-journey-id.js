import { JOURNEY_ID_KEY } from '../constants/correlation.js'

// Takes the journey id back out of the CDP Uploader metadata at the callback boundary.
// The uploader echoes the initiate metadata verbatim, so the journey id arrives inside a
// business object that this service persists and returns. Splitting it off here, once,
// keeps it out of every persisted metadata subdocument and every response body.
// Returns the id (undefined when absent) and a shallow copy of the metadata without it.
// The input is never mutated; a nullish input yields an empty metadata object.
export const splitJourneyId = (metadata) => {
  const { [JOURNEY_ID_KEY]: journeyId, ...metadataWithoutJourneyId } = metadata ?? {}

  return { journeyId, metadata: metadataWithoutJourneyId }
}
