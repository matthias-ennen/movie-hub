import {
  SOURCE_ADAPTER_CONTRACT_VERSION,
  normalizeBroadcastEvent,
  normalizeSourceEnvelope,
} from '../sourceAdapterContract.js'
import { joynPlaybackRouteForStation } from '../joyn/joynPlaybackRoute.js'

function text(value) {
  const result = String(value ?? '').trim()
  return result || null
}

export function mapJoynCandidateToBroadcastEvent(candidate, match, {
  channelId,
  verifiedAt = null,
  observedAt = new Date().toISOString(),
} = {}) {
  const tmdbId = Number(match?.tmdbId)
  const mediaType = match?.type === 'series' ? 'series' : match?.type === 'movie' ? 'movie' : null
  const canonicalChannelId = text(channelId)
  if (!candidate || !Number.isInteger(tmdbId) || tmdbId <= 0 || !mediaType || !canonicalChannelId) return null

  const startAt = new Date(candidate.startTime)
  const endAt = new Date(candidate.endTime)
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) return null

  const joynRoute = joynPlaybackRouteForStation(canonicalChannelId, {
    brandId: candidate.brandId,
    verifiedAt,
  })
  const playbackRoutes = joynRoute ? [joynRoute] : []

  return normalizeBroadcastEvent({
    eventId: ['broadcast', canonicalChannelId, startAt.toISOString(), mediaType, tmdbId].join(':'),
    titleRef: { mediaType, tmdbId },
    channelId: canonicalChannelId,
    channelName: text(candidate.channelTitle) || canonicalChannelId,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    playbackRoutes,
    sourceRefs: [{
      sourceId: 'joyn-epg',
      externalId: text(candidate.joynProgramId),
      observedAt,
      expiresAt: endAt.toISOString(),
    }],
    extensions: {
      joyn: {
        channelId: text(candidate.joynChannelId),
        programId: text(candidate.joynProgramId),
        brandId: text(candidate.brandId),
        brandCode: text(candidate.brandCode),
        channelLogoUrl: text(candidate.channelLogoUrl),
        streamType: text(candidate.streamType),
        quality: text(candidate.quality),
        programType: text(candidate.programType),
        rawTitle: text(candidate.title),
      },
    },
  })
}

export function buildJoynSourceEnvelope(events = [], {
  generatedAt = new Date().toISOString(),
  fetchedAt = generatedAt,
  sourceGenerationId = null,
  sourceCoverage = null,
} = {}) {
  const records = (Array.isArray(events) ? events : []).filter(Boolean)
  const latestEnd = records
    .map((event) => Date.parse(event.endAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]

  return normalizeSourceEnvelope({
    contractVersion: SOURCE_ADAPTER_CONTRACT_VERSION,
    sourceId: 'joyn',
    sourceGenerationId: sourceGenerationId || `joyn:${generatedAt}`,
    generatedAt,
    fetchedAt,
    expiresAt: Number.isFinite(latestEnd) ? new Date(latestEnd).toISOString() : null,
    sourceStatus: 'healthy',
    sourceCoverage,
    capabilities: {},
    extensions: { joyn: { eventCount: records.length } },
    records,
  })
}
