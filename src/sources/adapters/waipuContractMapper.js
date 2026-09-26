import { normalizeBroadcastEvent } from '../sourceAdapterContract.js'

function safeText(value) {
  const text = String(value ?? '').trim()
  return text || null
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

  const playbackRoutes = safeText(playbackTarget) ? [{
    providerId: 'waipu',
    mode: 'APP_DEEP_LINK',
    target: safeText(playbackTarget),
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
      },
    },
  })
}
