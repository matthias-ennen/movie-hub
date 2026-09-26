import { SOURCE_ADAPTER_CONTRACT_VERSION, exactBroadcastEventKey, normalizeBroadcastEvent, normalizeSourceEnvelope } from '../sourceAdapterContract.js'

function safeText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function waipuEpgPlaybackTarget(stationId, programId) {
  const station = safeText(stationId)
  const program = safeText(programId)
  if (!station || !program) return null
  return `https://app.waipu.tv/epgdetails/${encodeURIComponent(station)}/${encodeURIComponent(program)}`
}

export function mapWaipuAiringToBroadcastEvent(title, airing, {
  observedAt = new Date().toISOString(),
  playbackTarget = null,
  verifiedAt = null,
} = {}) {
  const mediaType = title?.type === 'series' || title?.mediaType === 'tv' ? 'series' : 'movie'
  const tmdbId = Number(title?.tmdbId)
  const stationId = safeText(airing?.stationId)
  const stationName = safeText(airing?.stationName)
  const programId = safeText(airing?.programId)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !stationId || !stationName) return null

  const startAt = new Date(airing?.startTime)
  const endAt = new Date(airing?.stopTime)
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) return null

  const sourceExternalId = programId || [
    stationId,
    startAt.toISOString(),
    mediaType,
    tmdbId,
  ].join('|')

  const exactPlaybackTarget = safeText(playbackTarget) || waipuEpgPlaybackTarget(stationId, programId)
  const playbackRoutes = exactPlaybackTarget ? [{
    providerId: 'waipu',
    mode: 'APP_DEEP_LINK',
    target: exactPlaybackTarget,
    requiresSubscription: true,
    verifiedAt,
  }] : []

  const capabilities = {}
  if (airing?.recordingAvailable !== undefined) {
    capabilities.recording = { available: airing.recordingAvailable === true }
  }
  if (airing?.replayAvailable !== undefined) {
    capabilities.replay = {
      available: airing.replayAvailable === true,
      ...(safeText(airing?.replayAvailableUntil)
        ? { availableUntil: new Date(airing.replayAvailableUntil).toISOString() }
        : {}),
    }
  }

  return normalizeBroadcastEvent({
    eventId: [
      'broadcast',
      stationId,
      startAt.toISOString(),
      mediaType,
      tmdbId,
    ].join(':'),
    titleRef: { mediaType, tmdbId },
    channelId: stationId,
    channelName: stationName,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    episode: mediaType === 'series' ? {
      seasonNumber: airing?.seasonNumber ?? null,
      episodeNumber: airing?.episodeNumber ?? null,
      title: airing?.episodeTitle ?? null,
    } : null,
    playbackRoutes,
    sourceRefs: [{
      sourceId: 'waipu-epg',
      externalId: sourceExternalId,
      observedAt,
      expiresAt: endAt.toISOString(),
    }],
    capabilities,
    extensions: {
      waipu: {
        programId,
        seriesId: safeText(airing?.seriesId),
        imageUrl: safeText(airing?.imageUrl),
        recordingRestrictions: airing?.recordingRestrictions ?? null,
        playbackRestrictions: airing?.playbackRestrictions ?? null,
        restrictions: airing?.restrictions ?? null,
        rerun: airing?.rerun ?? null,
        newTvMeta: airing?.newTvMeta ?? null,
        trackingContentId: safeText(airing?.trackingContentId),
      },
    },
  })
}


export function projectBroadcastEventToWaipuAiring(event) {
  if (!event || event.kind !== 'broadcast') return null
  const waipu = event?.extensions?.waipu || {}
  return {
    source: 'waipu',
    programId: safeText(waipu.programId),
    seriesId: safeText(waipu.seriesId),
    stationId: safeText(event.channelId),
    stationName: safeText(event.channelName),
    startTime: safeText(event.startAt),
    stopTime: safeText(event.endAt),
    episodeTitle: safeText(event?.episode?.title),
    seasonNumber: Number.isInteger(event?.episode?.seasonNumber) ? event.episode.seasonNumber : null,
    episodeNumber: Number.isInteger(event?.episode?.episodeNumber) ? event.episode.episodeNumber : null,
    imageUrl: safeText(waipu.imageUrl),
    ...(waipu.recordingRestrictions !== null && waipu.recordingRestrictions !== undefined
      ? { recordingRestrictions: waipu.recordingRestrictions } : {}),
    ...(waipu.playbackRestrictions !== null && waipu.playbackRestrictions !== undefined
      ? { playbackRestrictions: waipu.playbackRestrictions } : {}),
    ...(waipu.restrictions !== null && waipu.restrictions !== undefined
      ? { restrictions: waipu.restrictions } : {}),
    ...(waipu.rerun !== null && waipu.rerun !== undefined ? { rerun: waipu.rerun } : {}),
    ...(waipu.newTvMeta !== null && waipu.newTvMeta !== undefined ? { newTvMeta: waipu.newTvMeta } : {}),
    ...(waipu.trackingContentId ? { trackingContentId: waipu.trackingContentId } : {}),
  }
}


function routeKey(route) {
  return [route?.providerId || '', route?.mode || '', route?.target || ''].join('|')
}

function sourceRefKey(ref) {
  return [ref?.sourceId || '', ref?.externalId || '', ref?.observedAt || ''].join('|')
}

function mergeUnique(values, keyForValue) {
  const byKey = new Map()
  for (const value of Array.isArray(values) ? values : []) {
    const key = keyForValue(value)
    if (!key || byKey.has(key)) continue
    byKey.set(key, value)
  }
  return [...byKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value)
}

export function dedupeWaipuBroadcastEvents(events = []) {
  const normalizedEvents = (Array.isArray(events) ? events : [])
    .filter(Boolean)
    .map((event) => normalizeBroadcastEvent(event))
    .sort((left, right) => {
      const byEvent = exactBroadcastEventKey(left).localeCompare(exactBroadcastEventKey(right))
      if (byEvent) return byEvent
      const leftSource = left.sourceRefs.map(sourceRefKey).sort().join(',')
      const rightSource = right.sourceRefs.map(sourceRefKey).sort().join(',')
      const bySource = leftSource.localeCompare(rightSource)
      if (bySource) return bySource
      return left.playbackRoutes.map(routeKey).sort().join(',').localeCompare(
        right.playbackRoutes.map(routeKey).sort().join(','),
      )
    })

  const byEvent = new Map()
  for (const event of normalizedEvents) {
    const key = exactBroadcastEventKey(event)
    const existing = byEvent.get(key)
    if (!existing) {
      byEvent.set(key, event)
      continue
    }

    byEvent.set(key, normalizeBroadcastEvent({
      ...existing,
      playbackRoutes: mergeUnique(
        [...existing.playbackRoutes, ...event.playbackRoutes],
        routeKey,
      ),
      sourceRefs: mergeUnique(
        [...existing.sourceRefs, ...event.sourceRefs],
        sourceRefKey,
      ),
      capabilities: {
        ...event.capabilities,
        ...existing.capabilities,
      },
      extensions: {
        ...event.extensions,
        ...existing.extensions,
        waipu: {
          ...(event.extensions?.waipu || {}),
          ...(existing.extensions?.waipu || {}),
        },
      },
    }))
  }

  return [...byEvent.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, event]) => event)
}


export function buildWaipuSourceEnvelope(events = [], {
  generatedAt = new Date().toISOString(),
  fetchedAt = generatedAt,
  sourceGenerationId = null,
  sourceCoverage = null,
  extensions = {},
} = {}) {
  const records = dedupeWaipuBroadcastEvents(events)
  const latestEnd = records
    .map((event) => Date.parse(event.endAt))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0]

  return normalizeSourceEnvelope({
    contractVersion: SOURCE_ADAPTER_CONTRACT_VERSION,
    sourceId: 'waipu',
    sourceGenerationId: sourceGenerationId || `waipu:${generatedAt}`,
    generatedAt,
    fetchedAt,
    expiresAt: Number.isFinite(latestEnd) ? new Date(latestEnd).toISOString() : null,
    sourceStatus: 'healthy',
    sourceCoverage,
    capabilities: {},
    extensions: {
      waipu: {
        eventCount: records.length,
        ...extensions,
      },
    },
    records,
  })
}
