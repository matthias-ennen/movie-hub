/**
 * A narrow bridge for one independently corroborated TMDB movie identity
 * when a source FILM playlist title explicitly names its actor, but fuzzy
 * TMDB /search/tv returns a decades-separated same-title series.
 *
 * This is editorial film-identity evidence, NOT permission to claim an
 * independently verified DE playback offer, cut, source right or access tier.
 */
import {hasDominantFilmHypothesis} from '../src/providers/youtubeCuratedEditorialIndex.js'
import {explicitNamedActor} from './youtube-g2-curated-cast-evidence.mjs'

const positiveId=x=>Number.isInteger(Number(x))&&Number(x)>0?Number(x):null

export function hasExclusiveActorCanonicalFilmEvidence(source,row){
  const actor=explicitNamedActor(source?.sourceTitle)
  const evidence=row?.castEvidence
  const results=row?.topCandidates
  const tvIds=row?.alternativeTvIds
  const tvCandidates=row?.tvSearchEvidence?.candidates
  const top=Array.isArray(results)?results[0]:null
  if(source?.sourceScreened!==true||source.regionSignal==='excluded'
    ||!actor||row?.matchStatus!=='review-leading-movie-with-TV-alternatives'
    ||row.identityRisk!==null||row.publicIndexMembership!=='public-not-present'
    ||!Array.isArray(row.errors)||row.errors.length!==0
    ||evidence?.actorCreditEvidence!=='matched-a-tmdb-credit-list'
    ||evidence.affectsRanking!==true
    ||String(evidence.explicitActor||'').toLocaleLowerCase('de-DE')
      !==actor.toLocaleLowerCase('de-DE')
    ||!Array.isArray(evidence.creditedMovieIds)||evidence.creditedMovieIds.length!==1
    ||!Array.isArray(results)||(results.length!==2&&results.length!==3)
    ||!positiveId(top?.tmdbId)||evidence.creditedMovieIds[0]!==top.tmdbId
    ||top.quotedActorCreditMatches!==true||top.titleLevel!==4
    ||!Number.isFinite(top.score)||top.score<50
    ||!Number.isFinite(top.runtimeDelta)||top.runtimeDelta<0||top.runtimeDelta>2
    ||top.yearMismatch===true||top.sequelConflict===true
    ||!hasDominantFilmHypothesis(results)
    ||results.slice(1).some(r=>r.quotedActorCreditMatches!==false)
    ||!Array.isArray(tvIds)||tvIds.length===0
    ||!Array.isArray(tvCandidates))return false
  // A same-named TV show remains ambiguous unless the source actor and
  // movie duration are corroborated AND the TV results have a documented,
  // substantially different first-air era. Unknown years remain blocked.
  return tvIds.every(id=>tvCandidates.some(tv=>
    tv.tmdbTvId===id&&Number.isInteger(tv.firstAirYear)
    &&Number.isFinite(tv.yearGap)&&tv.yearGap>=25
    &&tv.disposition==='retained-for-film-tv-review'))
}
