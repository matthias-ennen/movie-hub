import {
  SOURCE_ADAPTER_CONTRACT_VERSION,
  normalizeAvailability,
  normalizeSourceEnvelope,
} from '../sourceAdapterContract.js'

// YouTube G2 – shared source-adapter contract. NO user/account-specific API keys.
// This maps source records, never guesses availability from YouTube video metadata.
export const YOUTUBE_SOURCE_ID = 'youtube'
export const YOUTUBE_PROVIDER_ID = 'youtube'
export const YOUTUBE_MAX_AGE_DAYS = 30
export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
export const YOUTUBE_ACCESS_TYPES = Object.freeze(['free', 'ads', 'flatrate', 'rent', 'buy'])
const ACCESS = new Set(YOUTUBE_ACCESS_TYPES)
const RISK = /(?:trailer|teaser|making.of|behind.the.scenes|gameplay|walkthrough|compilation|zusammenschnitt|staffel|episode|full season|deutsch lernen|recap|review|reaction)/i

function safeText(input, maxLength = 200) {
  return String(input ?? '').replace(/[<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}
function validIso(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
function durationMinutes(iso) {
  const m = String(iso || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  return m && (m[1] || m[2] || m[3])
    ? Math.round((Number(m[1] || 0) * 60 + Number(m[2] || 0) + Number(m[3] || 0) / 60) * 10) / 10
    : null
}
export function normalizeYoutubeVideoCandidate(raw, { observedAt = new Date().toISOString() } = {}) {
  const videoId = raw?.id
  if (!YOUTUBE_VIDEO_ID.test(String(videoId || ''))) return null
  const channelId = safeText(raw?.snippet?.channelId, 100)
  const title = safeText(raw?.snippet?.title)
  if (!channelId || !title) return null
  const region = raw?.contentDetails?.regionRestriction
  const explicitlyExcludedDE =
    Array.isArray(region?.blocked) && region.blocked.includes('DE')
    || Array.isArray(region?.allowed) && !region.allowed.includes('DE')
  const duration = durationMinutes(raw?.contentDetails?.duration)
  const visibility = raw?.status?.privacyStatus
  const publishedAt = validIso(raw?.snippet?.publishedAt)
  const checkTime = validIso(observedAt)
  if (!checkTime) throw new TypeError('observedAt must be an ISO timestamp')
  const contentRisk = RISK.test(title)
  const rejectionReason = visibility !== 'public' ? 'not-public'
    : explicitlyExcludedDE ? 'DE-explicitly-excluded'
    : duration === null ? 'duration-unknown'
    : duration < 60 ? 'short-form-or-part'
    : contentRisk ? 'video-content-type-risk'
    : null
  return {
    videoId, channelId, channelTitle: safeText(raw.snippet.channelTitle, 120),
    title, category: String(raw.snippet.categoryId || ''),
    minutes: duration, publishedAt, observedAt: checkTime,
    deRegionSignal: explicitlyExcludedDE ? 'excluded' : region?.allowed ? 'allowed' : 'unknown',
    watchUrl: 'https://www.youtube.com/watch?v=' + videoId,
    screening: { eligible: rejectionReason === null, rejectionReason },
    // API metadata cannot verify actual work/cut/rights/tariff/DE-app playback.
    workIdentityVerified: false,
    dePlaybackVerified: false,
    offerVerified: false,
  }
}
function verificationDate(value) {
  const at = validIso(value)
  if (!at) throw new TypeError('Independent verification must have a real timestamp')
  return at
}
/**
 * The ONLY mapper from a YouTube VIDEO to an Availability in the canonical
 * MovieHub adapter contract. Caller must provide independent positive proof.
 * Matching scores and regionRestriction are NEVER authorization to publish.
 */
export function mapVerifiedYoutubeVideoToAvailability(video, match, verification, {
  observedAt = new Date().toISOString(),
} = {}) {
  if (!YOUTUBE_VIDEO_ID.test(String(video?.videoId || '')) || video?.screening?.eligible !== true
    || !YOUTUBE_VIDEO_ID.test(String(verification?.verifiedVideoId || ''))
    || verification.verifiedVideoId !== video.videoId
    || verification.workIdentityVerified !== true
    || verification.fullWorkOrValidCutVerified !== true
    || verification.dePlaybackVerified !== true
    || verification.offerTypeVerified !== true
    || verification.sourceUseAuthorized !== true
    || !ACCESS.has(verification.accessType)) return null
  const mediaType = match?.mediaType === 'series' ? 'series' : match?.mediaType === 'movie' ? 'movie' : null
  const tmdbId = Number(match?.tmdbId)
  if (!mediaType || !Number.isInteger(tmdbId) || tmdbId <= 0) return null
  const verifiedAt = verificationDate(verification.verifiedAt)
  const observed = verificationDate(observedAt)
  const validUntil = new Date(Math.min(
    Date.parse(observed) + YOUTUBE_MAX_AGE_DAYS * 86400000,
    Date.parse(verifiedAt) + YOUTUBE_MAX_AGE_DAYS * 86400000,
  )).toISOString()
  if (Date.parse(validUntil) <= Date.parse(observed)) return null
  const route = 'https://www.youtube.com/watch?v=' + video.videoId
  return normalizeAvailability({
    availabilityId: ['youtube', mediaType, tmdbId, video.videoId, 'DE', verification.accessType].join(':'),
    titleRef: { mediaType, tmdbId }, providerId: 'youtube', region: 'DE',
    accessType: verification.accessType, validUntil,
    playbackRoutes: [{
      providerId: 'youtube', mode: 'APP_DEEP_LINK', scope: 'title', target: route,
      geoRegion: 'DE', verifiedAt,
    }],
    sourceRefs: [{
      sourceId: 'youtube', externalId: video.videoId, observedAt: observed, expiresAt: validUntil,
    }],
    matchReason: 'independently-verified-video-work-offer',
    capabilities: { regionalRestriction: { available: true, region: 'DE', independentlyVerified: true } },
    extensions: {
      youtube: {
        videoId: video.videoId,
        channelId: video.channelId,
        // preserve provenance without presenting the channel as a verified owner
        verifiedAt, contentIdentityEvidence: safeText(verification.workEvidence, 250) || null,
        deOfferEvidence: safeText(verification.offerEvidence, 250) || null,
      },
    },
  })
}
export function buildYoutubeSourceEnvelope(verifiedAvailabilities = [], {
  generatedAt = new Date().toISOString(),
  fetchedAt = generatedAt,
  sourceGenerationId = null,
  sourceCoverage = {},
} = {}) {
  const records = (Array.isArray(verifiedAvailabilities) ? verifiedAvailabilities : [])
    .filter(Boolean)
    .map((record) => normalizeAvailability(record))
  if (records.some((r) => r.providerId !== 'youtube')) {
    throw new TypeError('YouTube envelope cannot contain another provider')
  }
  return normalizeSourceEnvelope({
    contractVersion: SOURCE_ADAPTER_CONTRACT_VERSION,
    sourceId: YOUTUBE_SOURCE_ID,
    sourceGenerationId: sourceGenerationId || 'youtube:' + generatedAt,
    generatedAt, fetchedAt,
    // No availability may extend beyond independent confirmation expiry.
    expiresAt: records.length ? records.map((r) => r.validUntil).sort()[0] : generatedAt,
    sourceStatus: 'healthy', sourceCoverage,
    extensions: { youtube: { verifiedOfferRecords: records.length } },
    records,
  })
}
