export const SOURCE_ADAPTER_CONTRACT_VERSION = 1

export const SOURCE_STATUS = Object.freeze([
  'healthy',
  'degraded',
  'failed',
  'stale',
])

export const ACCESS_TYPES = Object.freeze([
  'flatrate',
  'free',
  'ads',
  'rent',
  'buy',
  'own',
])

export const PLAYBACK_MODES = Object.freeze([
  'APP_DEEP_LINK',
  'WEB_LINK',
  'DIRECT_STREAM',
  'RESOLVER',
])

const SOURCE_STATUS_SET = new Set(SOURCE_STATUS)
const ACCESS_TYPE_SET = new Set(ACCESS_TYPES)
const PLAYBACK_MODE_SET = new Set(PLAYBACK_MODES)

function text(value) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function iso(value, field, { optional = false } = {}) {
  if ((value === null || value === undefined || value === '') && optional) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${field} must be a valid date.`)
  return date.toISOString()
}

export function normalizeMediaType(value) {
  if (value === 'movie') return 'movie'
  if (value === 'series' || value === 'tv') return 'series'
  throw new TypeError('mediaType must be movie or series.')
}

export function normalizeTitleRef(raw) {
  const mediaType = normalizeMediaType(raw?.mediaType ?? raw?.type)
  const tmdbId = Number(raw?.tmdbId)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    throw new TypeError('tmdbId must be a positive integer.')
  }
  return { mediaType, tmdbId }
}

export function titleRefKey(raw) {
  const titleRef = normalizeTitleRef(raw)
  return `${titleRef.mediaType}:${titleRef.tmdbId}`
}

export function normalizeSourceRef(raw) {
  const sourceId = text(raw?.sourceId)
  if (!sourceId) throw new TypeError('sourceId is required.')
  return {
    sourceId,
    externalId: text(raw?.externalId),
    observedAt: iso(raw?.observedAt, 'observedAt'),
    expiresAt: iso(raw?.expiresAt, 'expiresAt', { optional: true }),
  }
}

export function normalizePlaybackRoute(raw) {
  const providerId = text(raw?.providerId)
  const mode = text(raw?.mode)
  const target = text(raw?.target)
  if (!providerId) throw new TypeError('PlaybackRoute.providerId is required.')
  if (!PLAYBACK_MODE_SET.has(mode)) throw new TypeError('PlaybackRoute.mode is invalid.')
  if (!target) throw new TypeError('PlaybackRoute.target is required.')

  return {
    providerId,
    mode,
    target,
    requiresAuth: raw?.requiresAuth === true,
    requiresSubscription: raw?.requiresSubscription === true,
    adSupported: raw?.adSupported === true,
    geoRegion: text(raw?.geoRegion),
    drm: text(raw?.drm),
    verifiedAt: iso(raw?.verifiedAt, 'verifiedAt', { optional: true }),
  }
}

function normalizeSourceRefs(values) {
  const unique = new Map()
  for (const value of Array.isArray(values) ? values : []) {
    const ref = normalizeSourceRef(value)
    unique.set(`${ref.sourceId}|${ref.externalId || ''}|${ref.observedAt}`, ref)
  }
  return [...unique.values()]
}

function normalizePlaybackRoutes(values) {
  const unique = new Map()
  for (const value of Array.isArray(values) ? values : []) {
    const route = normalizePlaybackRoute(value)
    unique.set(`${route.providerId}|${route.mode}|${route.target}`, route)
  }
  return [...unique.values()]
}

function optionalConfidence(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new TypeError('matchConfidence must be between 0 and 1.')
  }
  return number
}

export function normalizeAvailability(raw) {
  const availabilityId = text(raw?.availabilityId)
  const providerId = text(raw?.providerId)
  const region = text(raw?.region)?.toUpperCase() || null
  const accessType = text(raw?.accessType)
  if (!availabilityId) throw new TypeError('Availability.availabilityId is required.')
  if (!providerId) throw new TypeError('Availability.providerId is required.')
  if (!ACCESS_TYPE_SET.has(accessType)) throw new TypeError('Availability.accessType is invalid.')

  const validFrom = iso(raw?.validFrom, 'validFrom', { optional: true })
  const validUntil = iso(raw?.validUntil, 'validUntil', { optional: true })
  if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
    throw new TypeError('Availability.validUntil must be after validFrom.')
  }

  return {
    kind: 'availability',
    availabilityId,
    titleRef: normalizeTitleRef(raw?.titleRef),
    providerId,
    region,
    accessType,
    validFrom,
    validUntil,
    playbackRoutes: normalizePlaybackRoutes(raw?.playbackRoutes),
    sourceRefs: normalizeSourceRefs(raw?.sourceRefs),
    matchConfidence: optionalConfidence(raw?.matchConfidence),
    matchReason: text(raw?.matchReason),
  }
}

export function normalizeBroadcastEvent(raw) {
  const eventId = text(raw?.eventId)
  const channelId = text(raw?.channelId)
  const channelName = text(raw?.channelName)
  if (!eventId) throw new TypeError('BroadcastEvent.eventId is required.')
  if (!channelId) throw new TypeError('BroadcastEvent.channelId is required.')
  if (!channelName) throw new TypeError('BroadcastEvent.channelName is required.')

  const startAt = iso(raw?.startAt, 'startAt')
  const endAt = iso(raw?.endAt, 'endAt')
  if (Date.parse(endAt) <= Date.parse(startAt)) {
    throw new TypeError('BroadcastEvent.endAt must be after startAt.')
  }

  const seasonNumber = raw?.episode?.seasonNumber === null || raw?.episode?.seasonNumber === undefined
    ? null
    : Number(raw.episode.seasonNumber)
  const episodeNumber = raw?.episode?.episodeNumber === null || raw?.episode?.episodeNumber === undefined
    ? null
    : Number(raw.episode.episodeNumber)

  return {
    kind: 'broadcast',
    eventId,
    titleRef: normalizeTitleRef(raw?.titleRef),
    channelId,
    channelName,
    startAt,
    endAt,
    episode: raw?.episode
      ? {
          seasonNumber: Number.isInteger(seasonNumber) && seasonNumber >= 0 ? seasonNumber : null,
          episodeNumber: Number.isInteger(episodeNumber) && episodeNumber >= 0 ? episodeNumber : null,
          title: text(raw.episode.title),
        }
      : null,
    playbackRoutes: normalizePlaybackRoutes(raw?.playbackRoutes),
    sourceRefs: normalizeSourceRefs(raw?.sourceRefs),
    matchConfidence: optionalConfidence(raw?.matchConfidence),
    matchReason: text(raw?.matchReason),
  }
}

export function exactBroadcastEventKey(raw) {
  const event = normalizeBroadcastEvent(raw)
  return [
    titleRefKey(event.titleRef),
    event.channelId,
    event.startAt,
    event.endAt,
  ].join('|')
}

export function normalizeSourceEnvelope(raw) {
  const contractVersion = Number(raw?.contractVersion)
  const sourceId = text(raw?.sourceId)
  const sourceGenerationId = text(raw?.sourceGenerationId)
  const sourceStatus = text(raw?.sourceStatus)
  if (contractVersion !== SOURCE_ADAPTER_CONTRACT_VERSION) {
    throw new TypeError(`Unsupported source adapter contract version: ${raw?.contractVersion}`)
  }
  if (!sourceId) throw new TypeError('SourceEnvelope.sourceId is required.')
  if (!sourceGenerationId) throw new TypeError('SourceEnvelope.sourceGenerationId is required.')
  if (!SOURCE_STATUS_SET.has(sourceStatus)) throw new TypeError('SourceEnvelope.sourceStatus is invalid.')

  return {
    contractVersion,
    sourceId,
    sourceGenerationId,
    generatedAt: iso(raw?.generatedAt, 'generatedAt'),
    fetchedAt: iso(raw?.fetchedAt, 'fetchedAt'),
    expiresAt: iso(raw?.expiresAt, 'expiresAt', { optional: true }),
    sourceStatus,
    sourceCoverage: raw?.sourceCoverage ?? null,
    records: (Array.isArray(raw?.records) ? raw.records : []).map((record) => {
      if (record?.kind === 'availability') return normalizeAvailability(record)
      if (record?.kind === 'broadcast') return normalizeBroadcastEvent(record)
      throw new TypeError('SourceEnvelope record kind must be availability or broadcast.')
    }),
  }
}

export function deriveProviderIds({
  availabilities = [],
  broadcastEvents = [],
} = {}) {
  const ids = new Set()

  for (const availability of availabilities) {
    const normalized = normalizeAvailability(availability)
    ids.add(normalized.providerId)
    normalized.playbackRoutes.forEach((route) => ids.add(route.providerId))
  }

  for (const event of broadcastEvents) {
    const normalized = normalizeBroadcastEvent(event)
    normalized.playbackRoutes.forEach((route) => ids.add(route.providerId))
  }

  return [...ids]
}
