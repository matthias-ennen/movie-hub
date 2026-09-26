import { FIELD_DECISIONS } from '../fieldDiscovery.js'

export const WAIPU_FIELD_POLICY = Object.freeze({
  'id': { decision: FIELD_DECISIONS.CORE, reason: 'Program identity.' },
  'title': { decision: FIELD_DECISIONS.CORE, reason: 'Required for classification and matching.' },
  'originalTitle': { decision: FIELD_DECISIONS.CORE, reason: 'Useful for TMDB matching.' },
  'genre': { decision: FIELD_DECISIONS.CORE, reason: 'Grid classification signal.' },
  'mainGenre': { decision: FIELD_DECISIONS.CORE, reason: 'Program classification signal.' },
  'subGenres': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'waipu', reason: 'Useful source taxonomy, not canonical Movie Hub genre data.' },
  'startTime': { decision: FIELD_DECISIONS.CORE },
  'stopTime': { decision: FIELD_DECISIONS.CORE },
  'seriesId': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'waipu' },
  'seasonNumber': { decision: FIELD_DECISIONS.CORE },
  'episodeNumber': { decision: FIELD_DECISIONS.CORE },
  'episodeTitle': { decision: FIELD_DECISIONS.CORE },
  'imageUrl': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'waipu', reason: 'Source artwork reference; canonical artwork remains TMDB.' },
  'imageUrls': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'waipu' },
  'productionYear': { decision: FIELD_DECISIONS.CORE, reason: 'Matching signal.' },
  'productionCountries': { decision: FIELD_DECISIONS.CORE, reason: 'Matching signal.' },
  'recordingRestrictions': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'waipu', reason: 'Potentially useful recording metadata; retained without promoting unstable semantics to a shared capability.' },
  'playbackRestrictions': { decision: FIELD_DECISIONS.EXTENSION, extensionNamespace: 'waipu', reason: 'Potentially useful playback/replay metadata; retained until stable cross-source semantics are proven.' },
})
