// The query parameter name used to propagate the journey id to the CDP Uploader
// callback URL at initiate time, and to read it back on the callback request.
export const JOURNEY_ID_PARAM = 'journeyId'

// Matches a v4 UUID (case-insensitive), used to validate a journey id supplied
// on the callback query string before it is trusted enough to look up a session.
export const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
