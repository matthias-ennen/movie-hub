/**
 * Film identity only: two explicitly advertised actors, both credited to
 * exactly one full-length, exact-title movie and to NO rival TMDB movie.
 * Does not prove video playback, cut, licensing or an independently verified
 * German offer. No relaxation of the general single-actor film matcher.
 */
import {explicitBilledActorPair} from './youtube-g2-curated-cast-evidence.mjs'

export function hasExclusiveBilledPairFilmHypothesis(sourceTitle,row) {
  const names=explicitBilledActorPair(sourceTitle)
  const evidence=row?.castEvidence
  const scores=row?.topCandidates
  const winner=Array.isArray(scores)?scores[0]:null
  if(!names||!Array.isArray(scores)||(scores.length!==2&&scores.length!==3)
    ||row.matchStatus!=='review-leading-film-hypothesis'
    ||row.identityRisk!==null
    ||!Array.isArray(row.alternativeTvIds)||row.alternativeTvIds.length!==0
    ||!Array.isArray(row.errors)||row.errors.length!==0
    ||evidence?.actorCreditEvidence!=='matched-exclusive-two-actor-credit-list'
    ||evidence.affectsRanking!==true
    ||!Array.isArray(evidence.explicitActors)||evidence.explicitActors.length!==2
    ||evidence.explicitActors.some((name,i)=>name!==names[i])
    ||!Array.isArray(evidence.creditedMovieIds)
    ||evidence.creditedMovieIds.length!==1
    ||evidence.creditedMovieIds[0]!==winner?.tmdbId
    ||!Array.isArray(evidence.partiallyCreditedMovieIds)
    ||evidence.partiallyCreditedMovieIds.length!==0
    ||!Number.isInteger(winner?.tmdbId)||winner.tmdbId<=0
    ||winner.titleLevel!==4||!Number.isFinite(winner.score)||winner.score<50
    ||!Number.isFinite(winner.runtimeDelta)||winner.runtimeDelta<0
    ||winner.runtimeDelta>2||winner.quotedActorCreditMatches!==true
    ||winner.yearMismatch===true||winner.sequelConflict===true)return false
  const ids=new Set([winner.tmdbId])
  return scores.slice(1).every(other=>{
    if(!Number.isInteger(other?.tmdbId)||other.tmdbId<=0
      ||ids.has(other.tmdbId)||!Number.isFinite(other.score)
      ||!Number.isFinite(other.titleLevel)||other.titleLevel>4
      ||other.quotedActorCreditMatches!==false
      ||!Number.isFinite(other.runtimeDelta)||other.runtimeDelta<5
      ||winner.score-other.score<30||other.score>20)return false
    ids.add(other.tmdbId)
    return true
  })
}
