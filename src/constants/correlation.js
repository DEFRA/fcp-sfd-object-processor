// The query parameter name used to propagate the journey id to the CDP Uploader
// callback URL at initiate time, and to read it back on the callback request.
// Shared so the initiate handler and the callback route cannot drift apart.
export const JOURNEY_ID_PARAM = 'journeyId'
