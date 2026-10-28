/**
 * TMDB-first YouTube link evidence, not a second film catalog.
 * A TMDB/JustWatch offer can select a title for research but cannot itself
 * prove a playable YouTube video ID. Never publish matches from this module.
 */
import { scoreCandidateV11 } from './youtube-g2-matcher-v1-1.mjs'
import { prepareYouTubeMovieSearchTitle } from './youtube-g2-title-query-prep.mjs'
import { normalizeYoutubeVideoCandidate, YOUTUBE_VIDEO_ID } from '../src/sources/adapters/youtubeContractMapper.js'

export const TMDB_FIRST_SOURCE_MODE = 'TMDB_FIRST_LINK_RESEARCH_ONLY'
export const TMDB_FIRST_MAX_TITLES = 25
export const TMDB_FIRST_MAX_SEARCHES = 50
export const TMDB_FIRST_MAX_VIDEO_LOOKUPS = 50
const validId = value => Number.isInteger(Number(value)) && Number(value) > 0
const safe = value => String(value ?? '').replace(/[\r\n<>|]/g, ' ').replace(/\s+/g, ' ').trim()
const OFFER_TYPES = Object.freeze(['flatrate', 'free', 'ads', 'rent', 'buy'])

export function selectYoutubeBadgedMovies(index, { limit = TMDB_FIRST_MAX_TITLES } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > TMDB_FIRST_MAX_TITLES) {
    throw new Error('TMDB_FIRST_TITLE_LIMIT_INVALID')
  }
  if (index?.kind !== 'search-index' || index?.version !== 1
    || index?.country !== 'DE' || index?.source === 'fallback'
    || !Array.isArray(index?.entries) || index.entries.length < 100
    || index.count !== index.entries.length) {
    throw new Error('TMDB_FIRST_PUBLIC_INDEX_INVALID')
  }
  const ids = new Set()
  const eligible = []
  for (const e of index.entries) {
    if (e?.type !== 'movie' || !validId(e.tmdbId) || !safe(e.title)) continue
    // Existing YouTube badge is the seed. Do not confuse Google TV or Netzkino with YouTube.
    const labelled = (Array.isArray(e.providerIds) && e.providerIds.includes('youtube'))
      || (Array.isArray(e.providerOffers) && e.providerOffers.some(o => o?.id === 'youtube'))
    if (!labelled || ids.has(Number(e.tmdbId))) continue
    ids.add(Number(e.tmdbId))
    eligible.push({
      mediaType: 'movie', tmdbId: Number(e.tmdbId),
      title: safe(e.title), originalTitle: safe(e.originalTitle) || null,
      year: Number.isInteger(Number(e.year)) && Number(e.year) >= 1888 ? Number(e.year) : null,
      source: 'published-moviehub-search-index',
    })
  }
  // Explicitly bound to MovieHub's index; deterministic dispersed sample
  // rather than recent uploader titles. Known user-tested reference films first.
  const priority = [9479, 238, 872585]
  const known = priority.map(id => eligible.find(e => e.tmdbId === id)).filter(Boolean)
  const remaining = eligible.filter(e => !priority.includes(e.tmdbId))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.tmdbId - b.tmdbId)
  const chosen = [...known]
  if (remaining.length && chosen.length < limit) {
    const count = Math.min(limit - chosen.length, remaining.length)
    for (let i = 0; i < count; i++) {
      const position = count === 1 ? 0 : Math.floor(i * (remaining.length - 1) / (count - 1))
      chosen.push(remaining[position])
    }
  }
  return {
    publicYoutubeBadgedMovies: eligible.length,
    selected: chosen,
    publishedIndexGeneratedAt: index.generatedAt || null,
    publicIndexOnly: true,
  }
}

/**
 * Explicit, cursor-controlled research batch built from the FULL canonical
 * inventory plan, but still constrained to existing PUBLIC exact YouTube
 * badges. The MovieHub index, not an arbitrary caller, owns film identity.
 */
export function selectExplicitYoutubeBadgedMovies(index, refs, { limit = TMDB_FIRST_MAX_TITLES } = {}) {
  const validated = selectYoutubeBadgedMovies(index, { limit: 1 })
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > limit
    || !Number.isInteger(limit) || limit < 1 || limit > TMDB_FIRST_MAX_TITLES) {
    throw new Error('TMDB_FIRST_EXPLICIT_BATCH_SIZE_INVALID')
  }
  const eligible = new Map()
  for (const e of index.entries) {
    if (e?.type !== 'movie' || !validId(e.tmdbId) || !safe(e.title)) continue
    if (!((Array.isArray(e.providerIds) && e.providerIds.includes('youtube'))
      || (Array.isArray(e.providerOffers) && e.providerOffers.some(o => o?.id === 'youtube')))) continue
    const key = Number(e.tmdbId)
    if (eligible.has(key)) continue
    eligible.set(key, {
      mediaType:'movie',tmdbId:key,title:safe(e.title),
      originalTitle:safe(e.originalTitle) || null,
      year:Number.isInteger(Number(e.year)) && Number(e.year)>=1888 ? Number(e.year) : null,
      source:'published-moviehub-search-index',
    })
  }
  const seen = new Set(), selected = []
  for (const ref of refs) {
    const mediaType = ref?.mediaType
    const tmdbId = Number(ref?.tmdbId)
    if (mediaType !== 'movie' || !Number.isInteger(tmdbId) || !eligible.has(tmdbId)
      || seen.has(tmdbId)) throw new Error('TMDB_FIRST_EXPLICIT_BADGE_IDENTITY_INVALID')
    seen.add(tmdbId)
    selected.push(eligible.get(tmdbId))
  }
  return {
    ...validated,
    selected,
    selectionMode:'explicit-full-canonical-inventory-batch',
  }
}

export function exactYoutubeProviderIds(directory) {
  const entries = Array.isArray(directory?.results) ? directory.results : []
  return [...new Set(entries
    .filter(x => safe(x.provider_name).toLocaleLowerCase('en') === 'youtube')
    .map(x => Number(x.provider_id)).filter(validId))]
}

export function exactDeYoutubeOfferTypes(watchProviders, youtubeProviderIds) {
  const de = watchProviders?.results?.DE
  const ids = new Set(youtubeProviderIds || [])
  if (!de || !ids.size) return []
  return OFFER_TYPES.filter(type => Array.isArray(de[type])
    && de[type].some(p => ids.has(Number(p?.provider_id))))
}

function bestCandidate(rawVideo, tmdbFilm, observedAt) {
  const video = normalizeYoutubeVideoCandidate(rawVideo, { observedAt,allowExcludedDE:true })
  if (!video || !video.screening.eligible) return null
  const prepared = prepareYouTubeMovieSearchTitle(video.title)
  const assessment = scoreCandidateV11({
    title: prepared.matchingTitle, minutes: video.minutes,
    category: video.category, region: video.deRegionSignal,
  }, tmdbFilm)
  return {
    videoId: video.videoId, videoTitle: video.title,
    channelId: video.channelId, channelTitle: video.channelTitle,
    regionSignal: video.deRegionSignal, durationMinutes: video.minutes,
    titleLevel: assessment.titleLevel, runtimeDelta: assessment.runtimeDelta,
    yearMismatch: assessment.yearMismatch, sequelConflict: assessment.sequelConflict,
    sourceTypeRisk: assessment.sourceTypeRisk, score: assessment.score,
    // Candidate URL is solely internal review; never the badge playback route.
    candidateWatchUrl: video.watchUrl,
    strong: assessment.titleLevel === 4 && !assessment.yearMismatch
      && !assessment.sequelConflict && !assessment.behindScenes
      && !assessment.sourceTypeRisk && !assessment.currentReleaseRisk
      && assessment.runtimeDelta !== null && assessment.runtimeDelta <= 15,
  }
}

/** Pure single-title reverse matcher; even perfect metadata matches require review. */
export function evaluateTmdbFirstYoutubeLinks(seed, tmdbFilm, offerTypes, rawVideos, {
  observedAt = new Date().toISOString(),
} = {}) {
  if (seed?.mediaType !== 'movie' || !validId(seed.tmdbId)
    || Number(tmdbFilm?.id) !== Number(seed.tmdbId)) {
    throw new Error('TMDB_FIRST_TITLE_IDENTITY_INVALID')
  }
  const validTypes = [...new Set((offerTypes || []).filter(x => OFFER_TYPES.includes(x)))]
  if (!validTypes.length) return {
    ...seed, status: 'no-current-tmdb-de-youtube-offer',
    tmdbDeOfferTypes: [], videoCandidates: [], reviewedVideoId: null,
    directPlaybackRoute: null, publicationPermitted: false,
  }
  const unique = new Map()
  for (const raw of rawVideos || []) {
    if (!YOUTUBE_VIDEO_ID.test(String(raw?.id || '')) || unique.has(raw.id)) continue
    const candidate = bestCandidate(raw, tmdbFilm, observedAt)
    if (candidate) unique.set(raw.id, candidate)
  }
  const ranked = [...unique.values()].sort((a, b) => b.score - a.score
    || (a.runtimeDelta ?? 999) - (b.runtimeDelta ?? 999)
    || a.videoId.localeCompare(b.videoId))
  const strong = ranked.filter(x => x.strong)
  const status = strong.length === 1 ? 'review-single-video-candidate'
    : strong.length > 1 ? 'review-multiple-video-editions'
    : ranked.length ? 'review-weak-or-unresolved-videos' : 'no-video-candidate'
  return {
    ...seed, status, tmdbDeOfferTypes: validTypes,
    videoCandidates: ranked.slice(0, 10), reviewedVideoId: null,
    // Deliberately no exact player route based solely on video metadata,
    // TMDB presence, score, channel label or regionRestriction.
    directPlaybackRoute: null, publicationPermitted: false,
    verifiedFilmOrCut: false, verifiedDePlayback: false,
  }
}

/** The catalog/offer/notification state must never change in research. */
export function summarizeTmdbFirstPilot(rows, selection, counters) {
  const counts = {}
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1
  return {
    mode: TMDB_FIRST_SOURCE_MODE,
    publicYoutubeBadgedMovies: selection.publicYoutubeBadgedMovies,
    selectedMovies: selection.selected.length,
    processedMovies: rows.length,
    matcherVersion: 'v1.1',
    statusCounts: counts,
    calls: counters,
    candidateLinksForReview: rows.filter(x => x.status === 'review-single-video-candidate').length,
    verifiedDirectLinks: 0,
    verifiedSeriesEpisodes: 0,
    fullAccountInventory: 'not-loaded',
    publicationPermitted: false,
    catalogWrites: 0, firestoreWrites: 0, providerWrites: 0,
    badgeWrites: 0, nightlyWrites: 0,
  }
}
