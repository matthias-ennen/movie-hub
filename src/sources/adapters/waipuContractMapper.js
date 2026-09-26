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
