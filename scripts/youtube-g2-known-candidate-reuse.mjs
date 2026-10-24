/**
 * Existing MovieHub G2 TMDB-first video candidates, sourced ONLY from the
 * authenticated, previously completed private 25-film Golden QA artifact.
 *
 * Reuse means avoiding repeat search.list for the *same TMDB work*, not
 * granting an offer or playback route. A later videos.list checks metadata
 * again; title/cut/tariff and DE playback remain review-only.
 */
import {buildArchivedTmdbFirstReview,ARCHIVED_SOURCE_RUN}
  from './youtube-g2-tmdb-first-archived-review.mjs'

export const G2_KNOWN_CANDIDATE_SOURCE_RUN=ARCHIVED_SOURCE_RUN
export const G2_KNOWN_CANDIDATE_MAX_PER_MOVIE=10
const id=/^[A-Za-z0-9_-]{11}$/

export function getTrustedTmdbFirstKnownCandidates(archive){
  // Existing full historical integrity gate: original 25 work IDs, no writes,
  // recorded API call budgets, and no automatically approved routes.
  const historic=buildArchivedTmdbFirstReview(archive)
  if(historic.summary.sourceRun!==G2_KNOWN_CANDIDATE_SOURCE_RUN
    ||historic.summary.publishedDirectRoutes!==0
    ||historic.summary.approvedGermanOffers!==0)
    throw Error('G2_KNOWN_CANDIDATE_PROVENANCE_UNTRUSTED')
  const byMovie=new Map()
  for(const row of archive.rows){
    if(row.status==='no-current-public-youtube-badge')continue
    const candidateIds=row.videoCandidates.map(x=>x.videoId)
    if(candidateIds.length>G2_KNOWN_CANDIDATE_MAX_PER_MOVIE
      ||candidateIds.some(x=>!id.test(x))
      ||new Set(candidateIds).size!==candidateIds.length
      ||byMovie.has(row.tmdbId))
      throw Error('G2_KNOWN_CANDIDATE_ROW_UNTRUSTED')
    if(candidateIds.length)byMovie.set(row.tmdbId,candidateIds)
  }
  if(byMovie.size>25)throw Error('G2_KNOWN_CANDIDATE_COHORT_UNTRUSTED')
  return byMovie
}

/** Validate a manually wired map before any external API calls.
 * A Map is a discovery hint, NEVER an approval. Every candidate is
 * bounded and linked only to an integer TMDB film identity.
 */
export function validateKnownCandidateMap(map){
  if(map===null)return null
  if(!(map instanceof Map)||map.size>25)
    throw Error('G2_KNOWN_VIDEO_INPUT_INVALID')
  const normalized=new Map()
  for(const [tmdbId,videoIds] of map){
    if(!Number.isInteger(tmdbId)||tmdbId<1||!Array.isArray(videoIds)
      ||!videoIds.length||videoIds.length>G2_KNOWN_CANDIDATE_MAX_PER_MOVIE
      ||videoIds.some(x=>typeof x!=='string'||!id.test(x))
      ||new Set(videoIds).size!==videoIds.length)
      throw Error('G2_KNOWN_VIDEO_INPUT_INVALID')
    normalized.set(tmdbId,[...videoIds])
  }
  return normalized
}
