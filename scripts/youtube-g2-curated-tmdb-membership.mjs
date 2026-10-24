/**
 * Curated two-playlist QA -> conservative TMDB identity hypotheses
 * -> PUBLIC MovieHub search-index membership only.
 *
 * This module never infers a verified YouTube DE offer, a newly imported film,
 * or a valid direct playback route. All records remain in review.
 */
import { planCuratedTmdbQueries } from './youtube-g2-curated-title-query-plan.mjs'
import { scoreCandidateV11, classifyVideoV11 } from './youtube-g2-matcher-v1-1.mjs'
import { applyExplicitCastGuard } from './youtube-g2-curated-cast-evidence.mjs'
import { reviewTvSearchAlternatives } from './youtube-g2-tv-alternative-evidence.mjs'

export const CURATED_TMDB_MODE = 'CURATED_PLAYLIST_TMDB_PUBLIC_MEMBERSHIP_READ_ONLY'
export const CURATED_TMDB_MAX_CASES = 200
// Two movie queries, one TV query, up to three movie details per source video.
export const CURATED_TMDB_MAX_GETS = 1300
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const IDS = Object.freeze({
  free: 'PL9hLFbkmRD8nBj_e8FfntoBporPAqqeSJ',
  'rent-buy': 'PLJWJS8p_IeEo',
})
const safe = x => String(x ?? '').replace(/[<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
const positiveId = x => Number.isInteger(Number(x)) && Number(x) > 0 ? Number(x) : null

// An explicit reinterpretation (e.g. 'Ice Age 2 ... SPIELVERFILMUNG') may be
// a different work from the original movie even if its name is identical.
// This only adds a manual review flag; it is not an automated TMDB match.
export function explicitAlternateWorkFormRisk(sourceTitle) {
  return /\b(?:spielverfilmung|fan[- ]?made|fan[- ]?film|(?:ai|ki)[- ]?(?:generated|generiert))\b/iu.test(safe(sourceTitle))
    ? 'explicit-alternate-work-form' : null
}

// Edition / publisher provenance is a distinct uncertainty from TMDB work
// identity. "uncut", "unrated" or "bootleg" is NOT proof of matching the
// canonical work's theatrical/version cut; never silently promote that link.
export function explicitSourceOrCutRisk(sourceTitle) {
  return /\b(?:bootleg|unrated|uncut)\b|ungekürzte\s+fassung/iu.test(safe(sourceTitle))
    ? 'explicit-unverified-cut-or-source' : null
}

export function validateCuratedTmdbInputs(audit, publicIndex, observedAt) {
  if (audit?.mode !== 'CURATED_TWO_PLAYLISTS_READ_ONLY'
    || audit?.fullyScanned !== true || audit?.publicationPermitted !== false
    || !Array.isArray(audit?.playlistSummaries) || audit.playlistSummaries.length !== 2
    || Object.entries(IDS).some(([mode, id]) =>
      !audit.playlistSummaries.some(p =>
        p.mode === mode && p.playlistId === id && p.fullyScanned === true))
    || !Array.isArray(audit?.candidates)
    || audit.candidates.length < 1 || audit.candidates.length > CURATED_TMDB_MAX_CASES
    || audit.uniqueVideoIds !== audit.candidates.length
    || new Set(audit.candidates.map(c => c.videoId)).size !== audit.candidates.length
    || audit.candidates.some(c => !VIDEO_ID.test(String(c.videoId))
      || !Array.isArray(c.playlistModes) || c.playlistModes.length < 1
      || c.playlistModes.some(mode => mode !== 'free' && mode !== 'rent-buy')
      || c.editorialOfferHint !== (c.playlistModes.includes('free') ? 'free' : 'rent-buy')
      || c.accepted !== false || c.toImport !== false
      || c.playbackRoute !== null || c.verifiedOfferType !== null)
    || ['catalogWrites','firestoreWrites','providerWrites','badgeWrites','nightlyWrites']
      .some(field => audit[field] !== 0)) {
    throw new Error('CURATED_QA_PROVENANCE_OR_NO_WRITE_INVALID')
  }
  const age = Date.parse(observedAt) - Date.parse(audit.observedAt || '')
  if (!Number.isFinite(age) || age < -60000 || age > 7 * 86400000) {
    throw new Error('CURATED_QA_EXPIRED_OR_FUTURE')
  }
  if (publicIndex?.kind !== 'search-index' || publicIndex?.version !== 1
    || publicIndex?.country !== 'DE' || publicIndex?.source === 'fallback'
    || !Array.isArray(publicIndex?.entries) || publicIndex.count !== publicIndex.entries.length
    || !publicIndex.entries.length) {
    throw new Error('PUBLISHED_MOVIEHUB_INDEX_INVALID')
  }
  const indexAge = Date.parse(observedAt) - Date.parse(publicIndex.generatedAt || '')
  if (!Number.isFinite(indexAge) || indexAge < -86400000 || indexAge > 30 * 86400000) {
    throw new Error('PUBLISHED_MOVIEHUB_INDEX_STALE_OR_FUTURE')
  }
  return true
}

export async function runCuratedTmdbMembership({
  audit, publicIndex, tmdbGet, now = () => new Date().toISOString(),
} = {}) {
  if (typeof tmdbGet !== 'function') throw new Error('READ_ONLY_TMDB_CALLBACK_REQUIRED')
  const observedAt = new Date(now()).toISOString()
  validateCuratedTmdbInputs(audit, publicIndex, observedAt)
  const publicMovies = new Set(publicIndex.entries
    .filter(e => e?.type === 'movie').map(e => positiveId(e?.tmdbId)).filter(Boolean))
  let tmdbCalls = 0
  const cache = new Map()
  const get = async (path, params = {}) => {
    if (!/^\/(?:search\/(?:movie|tv)|movie\/[1-9]\d*)$/.test(path)) {
      throw new Error('CURATED_TMDB_ENDPOINT_NOT_APPROVED')
    }
    const key = path + ':' + JSON.stringify(params)
    if (cache.has(key)) return cache.get(key)
    if (++tmdbCalls > CURATED_TMDB_MAX_GETS) throw new Error('CURATED_TMDB_GET_BUDGET_EXCEEDED')
    const data = await tmdbGet(path, params)
    cache.set(key, data)
    return data
  }
  const rows = []
  for (const c of audit.candidates) {
    const base = {
      videoId: c.videoId, playlistModes: c.playlistModes,
      editorialOfferHint: c.editorialOfferHint,
      videoTitle: safe(c.videoTitle), minutes: c.minutes,
      castEvidence: null, castChangedTopId: false,
      identityRisk: explicitAlternateWorkFormRisk(c.videoTitle)
        || explicitSourceOrCutRisk(c.videoTitle),
      hasPlaylistOverlap: c.playlistModes.length > 1,
      // Historical field: overlap is now resolved by FREE precedence, not a conflict.
      hasPlaylistOfferConflict: false,
      sourceStatus: c.status, sourceVideoDetailAvailable: Boolean(c.videoTitle),
      playbackRoute: null, verifiedOfferType: null, verifiedTmdbId: null,
      verifiedDEPlayback: false, toImport: false, publicationPermitted: false,
    }
    // Missing/blocked/short videos cannot be promoted; category overlap
    // may be searched for film identity but never resolve its offer type.
    if (!c.screened || !c.videoTitle || !Number.isFinite(Number(c.minutes))) {
      rows.push({ ...base, matchStatus: 'review-no-eligible-video-details',
        topCandidates: [], publicIndexMembership: 'unknown', errors: [] })
      continue
    }
    const prepared = planCuratedTmdbQueries(c.videoTitle)
    const queryVariants = [...new Set((prepared.queries || [])
      .map(x => safe(x)).filter(Boolean))].slice(0, 2)
    // 'IT' and similar one/two-character source titles have no safe query
    // identity. Keep them in the 1:1 QA, without guessing an existing film.
    if (queryVariants.length === 0 && safe(c.videoTitle).length < 3) {
      rows.push({...base, matchStatus:'review-short-ambiguous-title',
        curatedQueryReason:null, tmdbQueries:[],
        topCandidates:[], alternativeTvIds:[],
        publicIndexMembership:'unknown', errors:[]})
      continue
    }
    const movieIds = new Set()
    const tvHits = []
    const details = []
    const tmdbFilms = []
    const errors = []
    try {
      for (const query of queryVariants) {
        const answer = await get('/search/movie', {
          language: 'de-DE', query, include_adult: 'false', page: 1,
        })
        for (const item of (answer?.results || []).slice(0, 3)) {
          const id = positiveId(item?.id)
          if (id) movieIds.add(id)
        }
      }
      const answer = await get('/search/tv', {
        language: 'de-DE', query: prepared.matchingTitle,
        include_adult: 'false', page: 1,
      })
      for (const item of (answer?.results || []).slice(0, 3)) {
        const id = positiveId(item?.id)
        if (id && !tvHits.some(x=>positiveId(x?.id)===id)) tvHits.push(item)
      }
      for (const id of [...movieIds].slice(0, 3)) {
        const movie = await get('/movie/' + id, {
          language: 'de-DE', append_to_response: 'alternative_titles,credits,external_ids',
        })
        if (Number(movie?.id) !== id) throw new Error('CURATED_TMDB_MOVIE_ID_MISMATCH')
        tmdbFilms.push(movie)
        details.push(scoreCandidateV11({
          title: prepared.matchingTitle, minutes: Number(c.minutes),
          category: 'unknown', region: c.deRegionSignal || 'unknown',
        }, movie))
      }
    } catch (e) {
      if (/BUDGET|quota|429|403|rate.limit/i.test(String(e?.message || ''))) throw e
      errors.push(safe(e?.message))
    }
    const cast = applyExplicitCastGuard(c.videoTitle, details, tmdbFilms)
    const originalTopId = [...details].sort((a,b) => b.score - a.score)[0]?.tmdbId || null
    const firstFilmId=[...cast.scores].sort((a,b)=>b.score-a.score)[0]?.tmdbId
    const topMovie=tmdbFilms.find(x=>Number(x.id)===firstFilmId)
    const tvEvidence=reviewTvSearchAlternatives({
      sourceTitle:prepared.matchingTitle,movie:topMovie,tvResults:tvHits,
    })
    const verdict = classifyVideoV11({
      title: prepared.matchingTitle, minutes: Number(c.minutes),
      category: 'unknown', region: c.deRegionSignal || 'unknown',
    }, cast.scores, tvEvidence.alternativeTvIds, { incomplete: errors.length > 0,
      asOfYear: Number(observedAt.slice(0,4)) })
    const topCandidates = verdict.topCandidates.map(v => ({
      tmdbId: v.tmdbId, score: v.score,
      titleLevel: v.titleLevel, runtimeDelta: v.runtimeDelta,
      yearMismatch: v.yearMismatch, sequelConflict: v.sequelConflict,
      quotedActorCreditMatches: v.quotedActorCreditMatches ?? null,
    }))
    const topId = positiveId(topCandidates[0]?.tmdbId)
    rows.push({
      ...base, matchStatus: base.identityRisk
        ? (base.identityRisk === 'explicit-unverified-cut-or-source'
          ? 'review-explicit-source-or-cut-risk'
          : 'review-explicit-alternate-work-form') : verdict.status,
      curatedQueryReason: prepared.curatedQueryReason,
      tmdbQueries: queryVariants,
      castEvidence: cast.evidence,
      castChangedTopId: cast.evidence.affectsRanking === true
        && Number(originalTopId) !== Number(verdict.topCandidates[0]?.tmdbId),
      topCandidates,
      alternativeTvIds: tvEvidence.alternativeTvIds,
      tvSearchEvidence: tvEvidence,
      // Membership is not verification. Absent in a PUBLIC search index
      // never implies that a personal/hidden MovieHub film is 'new'.
      publicIndexMembership: topId === null ? 'unknown'
        : publicMovies.has(topId) ? 'public-present' : 'public-not-present',
      errors,
    })
  }
  const counts = {}
  const membership = {}
  for (const row of rows) {
    counts[row.matchStatus] = (counts[row.matchStatus] || 0) + 1
    membership[row.publicIndexMembership] = (membership[row.publicIndexMembership] || 0) + 1
  }
  return {
    summary: {
      mode: CURATED_TMDB_MODE, generatedAt: observedAt,
      sourceQAObservedAt: audit.observedAt,
      sourceVideoIds: audit.uniqueVideoIds, processedRows: rows.length,
      sourcePlaylistIds: audit.playlistSummaries.map(x => x.playlistId),
      publishedIndexGeneratedAt: publicIndex.generatedAt,
      publicIndexOnly: true,
      matcherVersion: 'v1.1+explicit-cast+alternate-work-form-review', counts,
      alternateWorkFormRisks: rows.filter(x => x.identityRisk !== null).length,
      actorEvidenceCases: rows.filter(x => x.castEvidence?.affectsRanking === true).length,
      curatedQueryCorrections: rows.filter(x => x.curatedQueryReason).length,
      rawTvSearchHits:rows.reduce((n,x)=>n+(x.tvSearchEvidence?.rawTvIds.length||0),0),
      excludedUnrelatedTvSearchHits:rows.reduce((n,x)=>
        n+(x.tvSearchEvidence?.unrelatedTvIds.length||0),0),
      castChangedTopIds: rows.filter(x => x.castChangedTopId).length,
      publicIndexMembership: membership,
      tmdbCalls, verifiedFilms: 0, verifiedDEOffers: 0, newMovieImports: 0,
      publicationPermitted: false,
      catalogWrites: 0, firestoreWrites: 0, providerWrites: 0,
      badgeWrites: 0, nightlyWrites: 0,
    },
    rows,
  }
}
