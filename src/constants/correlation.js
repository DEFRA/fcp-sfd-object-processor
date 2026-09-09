// The key under which the journey id travels inside the CDP Uploader `metadata`
// object: set on the initiate request and echoed back verbatim on the callback.
// Shared so the initiate handler and the callback route cannot drift apart.
export const JOURNEY_ID_KEY = 'journeyId'
