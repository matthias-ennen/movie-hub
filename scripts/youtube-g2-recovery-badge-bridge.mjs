/**
 * Two deliberately read-only steps from the same fixed playlist inventory:
 * (1) Recheck previously unresolvable video metadata; never treat absence as deletion.
 * (2) Bridge safe film hypotheses to the EXISTING MovieHub YouTube provider badges.
 *
 * This is NOT the source-to-Availability publisher. The only publisher is the
 * independently verified adapter contract in src/sources/adapters/youtubeContractMapper.js.
 */
import { normalizeYoutubeVideoCandidate } from '../src/sources/adapters/youtubeContractMapper.js'

export const G2_BRIDGE_MODE = 'YOUTUBE_G2_RECOVERY_EXISTING_BADGE_REVIEW_ONLY'
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const FIXED_SOURCES = Object.freeze({
  free: 'PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ',
  'rent-buy': 'PLJWJS8p_IeEo',
})
const NO_WRITES = ['catalogWrites', 'firestoreWrites', 'providerWrites', 'badgeWrites', 'nightlyWrites']
const id = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null

function inspectAudit(audit) {
  if (audit?.mode !== 'CURATED_TWO_PLAYLISTS_READ_ONLY'
    || audit?.fullyScanned !== true || audit?.publicationPermitted !== false
    || !Array.isArray(audit.playlistSummaries) || audit.playlistSummaries.length !== 2
    || Object.entries(FIXED_SOURCES).some(([mode, playlistId]) =>
      !audit.playlistSummaries.some(p =>
        p.mode === mode && p.playlistId === playlistId && p.fullyScanned === true))
    || !Array.isArray(audit.candidates) || audit.candidates.length === 0
    || audit.candidates.length > 50
    || audit.uniqueVideoIds !== audit.candidates.length
    || new Set(audit.candidates.map(c => c.videoId)).size !== audit.candidates.length
    || audit.candidates.some(c => !VIDEO_ID.test(String(c.videoId || ''))
      || c.accepted !== false || c.toImport !== false
      || c.playbackRoute !== null || c.verifiedOfferType !== null
      || !Array.isArray(c.playlistModes) || c.playlistModes.length < 1)
    || NO_WRITES.some(k => audit[k] !== 0)) {
    throw new Error('RECOVERY_SOURCE_QA_INVALID_OR_WRITABLE')
  }
}
const safe = v => String(v ?? '').replace(/[\r\n<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)

/** Retry only the exact originally missing video IDs, not whole-channel discovery. */
export async function runCuratedMissingVideoRecovery({
  audit, youtubeApi, at = () => new Date().toISOString(),
} = {}) {
  inspectAudit(audit)
  if (typeof youtubeApi !== 'function') throw new Error('READ_ONLY_YOUTUBE_CALLBACK_REQUIRED')
  const checkedAt = new Date(at()).toISOString()
  const age = Date.parse(checkedAt) - Date.parse(audit.observedAt || '')
  if (!Number.isFinite(age) || age < -60000 || age > 7 * 86400000) {
    throw new Error('RECOVERY_SOURCE_QA_STALE_OR_FUTURE')
  }
  const missing = audit.candidates.filter(c => c.status === 'review-video-missing-or-private'
    && !c.videoTitle && c.screened === false)
  if (missing.length > 50) throw new Error('RECOVERY_VIDEO_BUDGET_EXCEEDED')
  const found = new Map()
  if (missing.length) {
    const requested = new Set(missing.map(c => c.videoId))
    const response = await youtubeApi('videos', {
      part: 'snippet,contentDetails,status', id: missing.map(c => c.videoId).join(','),
    })
    if (!Array.isArray(response?.items)) throw new Error('RECOVERY_VIDEO_API_RESPONSE_INVALID')
    for (const raw of response.items) {
      if (requested.has(raw?.id) && !found.has(raw.id)) found.set(raw.id, raw)
    }
  }
  let recovered = 0
  let recoveredEligible = 0
  const candidates = audit.candidates.map(c => {
    if (!missing.some(x => x.videoId === c.videoId)) return { ...c }
    const raw = found.get(c.videoId)
    const video = raw ? normalizeYoutubeVideoCandidate(raw, { observedAt: checkedAt }) : null
    if (!video) return {
      ...c, metadataRecoveryStatus: 'still-unavailable-or-not-returned',
      metadataRecheckedAt: checkedAt,
      // Never mark deleted or revoke an existing badge based on API absence.
      deletionConfirmed: false,
    }
    recovered++
    if (video.screening.eligible) recoveredEligible++
    const conflict = c.playlistModes.length !== 1
    return {
      ...c,
      videoTitle: safe(video.title),
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      minutes: video.minutes,
      deRegionSignal: video.deRegionSignal,
      youtubeWatchUrl: video.watchUrl,
      screened: video.screening.eligible,
      status: conflict ? 'review-conflicting-curation'
        : video.screening.eligible ? 'review-tmdb-work-identity' : 'review-screening-rejected',
      metadataRecoveryStatus: video.screening.eligible
        ? 'new-detail-needs-tmdb-review' : 'new-detail-screening-rejected',
      metadataRecheckedAt: checkedAt,
      deletionConfirmed: false,
      verifiedOfferType: null, titleRef: null, accepted: false,
      toImport: false, playbackRoute: null,
    }
  })
  const out = {
    ...audit,
    // Keep source inventory/observedAt and source provenance unchanged.
    candidates,
    counts: Object.fromEntries([...new Set(candidates.map(c => c.status))]
      .map(s => [s, candidates.filter(c => c.status === s).length])),
    metadataRecovery: {
      checkedAt, attempted: missing.length, recovered,
      recoveredEligible, stillMissing: missing.length - recovered,
      youtubeVideoLookupCalls: missing.length ? 1 : 0,
      deletedVideoIdsConfirmed: 0, sourceInventoryChanged: false,
    },
    independentlyVerifiedWorks: 0, verifiedDEOffers: 0,
    publicationPermitted: false,
    catalogWrites: 0, firestoreWrites: 0, providerWrites: 0,
    badgeWrites: 0, nightlyWrites: 0,
  }
  inspectAudit(out)
  if (out.uniqueVideoIds !== audit.uniqueVideoIds
    || out.candidates.some((c, i) => c.videoId !== audit.candidates[i].videoId)) {
    throw new Error('RECOVERY_VIDEO_ID_INTEGRITY_FAILED')
  }
  return out
}

/** Diagnostics-only join: video->TMDB hypothesis->existing exact YouTube badge. */
export function buildExistingYoutubeBadgeLinkReview({ audit, tmdbRows, publicIndex } = {}) {
  inspectAudit(audit)
  if (!Array.isArray(tmdbRows) || tmdbRows.length !== audit.candidates.length
    || publicIndex?.kind !== 'search-index' || publicIndex?.country !== 'DE'
    || publicIndex?.version !== 1 || publicIndex?.source === 'fallback'
    || !Array.isArray(publicIndex.entries)
    || publicIndex.count !== publicIndex.entries.length) {
    throw new Error('BRIDGE_INPUTS_INVALID')
  }
  const byVideo = new Map(tmdbRows.map(r => [r.videoId, r]))
  if (byVideo.size !== audit.candidates.length
    || audit.candidates.some(c => !byVideo.has(c.videoId))) {
    throw new Error('BRIDGE_VIDEO_IDS_MISMATCH')
  }
  const publicMovies = new Map(publicIndex.entries.filter(e => e?.type === 'movie'
    && id(e.tmdbId)).map(e => [Number(e.tmdbId), e]))
  const records = audit.candidates.map(c => {
    const r = byVideo.get(c.videoId)
    const top = r.topCandidates?.[0]
    const tmdbId = id(top?.tmdbId)
    const movie = tmdbId ? publicMovies.get(tmdbId) : null
    const hasYoutubeBadge = !!(movie && (
      (Array.isArray(movie.providerIds) && movie.providerIds.includes('youtube'))
      || (Array.isArray(movie.providerOffers)
        && movie.providerOffers.some(o => o?.id === 'youtube'))))
    const identityReviewable = r.matchStatus === 'review-leading-film-hypothesis'
      && Number(top?.titleLevel) >= 3 && Number(top?.runtimeDelta) <= 15
      && top?.yearMismatch !== true && top?.sequelConflict !== true
      && c.screened === true && c.playlistModes.length === 1
    const candidateWatchUrl = identityReviewable && hasYoutubeBadge
      ? 'https://www.youtube.com/watch?v=' + c.videoId : null
    return {
      videoId: c.videoId,
      proposedTitleRef: tmdbId ? { mediaType: 'movie', tmdbId } : null,
      playlistModes: c.playlistModes,
      matchingStatus: r.matchStatus,
      publicMovieFound: !!movie, existingExactYoutubeBadge: hasYoutubeBadge,
      editorialOfferHint: c.editorialOfferHint,
      reviewCandidateWatchUrl: candidateWatchUrl,
      // The video/film/cut, tariff, DE playback and rights are not verified.
      verifiedTitleRef: null, verifiedOfferType: null,
      productionAvailability: null, productionPlaybackRoute: null,
      toImport: false, publicationPermitted: false,
      reviewStatus: c.playlistModes.length > 1 ? 'review-overlapping-editorial-offer'
        : !c.screened ? 'review-missing-or-ineligible-video'
        : !tmdbId ? 'review-unresolved-film-identity'
        : !movie ? 'review-not-in-public-index'
        : !hasYoutubeBadge ? 'review-existing-movie-without-exact-youtube-badge'
        : candidateWatchUrl ? 'review-existing-youtube-badge-route-candidate'
        : 'review-film-or-episode-identity',
    }
  })
  return {
    mode: G2_BRIDGE_MODE, sourceVideoIds: records.length,
    knownPublicYoutubeBadges: records.filter(x => x.existingExactYoutubeBadge).length,
    candidateExistingBadgeRoutes: records.filter(x => x.reviewCandidateWatchUrl).length,
    notYetVerified: records.length,
    fullAccountCatalogCompared: false,
    verifiedDEOffers: 0, independentlyVerifiedWorks: 0,
    publicationPermitted: false,
    catalogWrites: 0, firestoreWrites: 0, providerWrites: 0,
    badgeWrites: 0, nightlyWrites: 0,
    records,
  }
}
