/**
 * TMDB-first: evidence of PREVIOUSLY observed video IDs, not availability.
 * An official search.list result is incomplete (e.g. Nightmare Before
 * Christmas). Re-fetching a known exact video through videos.list costs no
 * additional search.list quota and runs the NORMAL film/cut matcher.
 *
 * These are user-reported device observations, NEVER approved DE offers.
 * A previous player opening can go stale, change cut, region or tariff.
 */
import {
  TMDB_FIRST_GOLDEN,KNOWN_SEARCH_MISS,
} from './youtube-g2-quality-golden.mjs'

export const TMDB_FIRST_PRIOR_DEVICE_CANDIDATE_KIND='prior-user-device-playback-observation'
export const TMDB_FIRST_KNOWN_DEVICE_CANDIDATES=Object.freeze([
  Object.freeze({tmdbId:KNOWN_SEARCH_MISS.tmdbId,
    videoId:KNOWN_SEARCH_MISS.observedExactVideoId,
    evidenceKind:TMDB_FIRST_PRIOR_DEVICE_CANDIDATE_KIND,
    independentlyVerifiedDEOffer:false}),
  ...TMDB_FIRST_GOLDEN
    .filter(x=>x.manualDevicePlaybackReported)
    .map(x=>Object.freeze({tmdbId:x.tmdbId,videoId:x.leadVideoId,
      evidenceKind:TMDB_FIRST_PRIOR_DEVICE_CANDIDATE_KIND,
      independentlyVerifiedDEOffer:false})),
])

const VIDEO=/^[A-Za-z0-9_-]{11}$/
export const TMDB_FIRST_PRIOR_CANDIDATE_MAX=25

/**
 * Bound hints to exactly selected, already-public TMDB-first movie identities.
 * Repeated video IDs for different movies are conflicting evidence, not data
 * we can guess through. All hints stay read-only and independently unverified.
 */
export function planTmdbFirstPriorDeviceCandidates(seeds,candidates=TMDB_FIRST_KNOWN_DEVICE_CANDIDATES){
  if(!Array.isArray(seeds)||!Array.isArray(candidates)
    ||candidates.length>TMDB_FIRST_PRIOR_CANDIDATE_MAX)
    throw Error('TMDB_FIRST_PRIOR_DEVICE_INPUT_INVALID')
  const selected=new Set()
  for(const seed of seeds){
    const id=Number(seed?.tmdbId)
    if(seed?.mediaType!=='movie'||!Number.isInteger(id)||id<=0
      ||selected.has(id))throw Error('TMDB_FIRST_PRIOR_DEVICE_SEED_INVALID')
    selected.add(id)
  }
  const byMovie=new Map(),seenVideos=new Map()
  for(const c of candidates){
    const id=Number(c?.tmdbId)
    if(!Number.isInteger(id)||id<=0||!VIDEO.test(String(c?.videoId||''))
      ||c.evidenceKind!==TMDB_FIRST_PRIOR_DEVICE_CANDIDATE_KIND
      ||c.independentlyVerifiedDEOffer!==false
      ||c.approved===true||c.dePlaybackVerified===true
      ||c.offerTypeVerified===true||c.publicationPermitted===true)
      throw Error('TMDB_FIRST_PRIOR_DEVICE_NOT_SAFE_FOR_REVIEW')
    // Only research selected titles. A historical device observation for a
    // different film must not leak onto any other TMDB identity.
    if(!selected.has(id))continue
    if(byMovie.has(id)||seenVideos.has(c.videoId))
      throw Error('TMDB_FIRST_PRIOR_DEVICE_CONFLICTING_IDENTITIES')
    byMovie.set(id,c.videoId)
    seenVideos.set(c.videoId,id)
  }
  return byMovie
}
