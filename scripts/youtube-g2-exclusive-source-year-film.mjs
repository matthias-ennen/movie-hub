/**
 * Explicit year in a curated full-film source title disambiguates a film
 * remake only when ALL other exact-title TMDB movies contradict that year.
 *
 * Source titles are editorial claims, not verified content/rights. Keep
 * cut, source, region, TV, ambiguous same-year works and runtime checks.
 */
const YEAR=/(?:\(((?:19|20)\d{2})\)|[\s–—-]((?:19|20)\d{2}))\s*$/u
export function terminalPublisherFilmYear(title){
  const match=String(title??'').trim().match(YEAR)
  return match?Number(match[1]||match[2]):null
}
export function hasExclusiveReportedYearFilmHypothesis(sourceTitle,row){
  const sourceYear=terminalPublisherFilmYear(sourceTitle)
  const results=row?.topCandidates
  const winner=Array.isArray(results)?results[0]:null
  if(sourceYear===null||row?.matchStatus!=='review-leading-film-hypothesis'
    ||row.identityRisk!==null
    ||!Array.isArray(row.errors)||row.errors.length!==0
    ||!Array.isArray(row.alternativeTvIds)||row.alternativeTvIds.length!==0
    ||!Array.isArray(results)||(results.length!==2&&results.length!==3)
    ||!Number.isInteger(winner?.tmdbId)||winner.tmdbId<=0
    ||winner.titleLevel!==4||!Number.isFinite(winner.score)||winner.score<44
    ||!Number.isFinite(winner.runtimeDelta)||winner.runtimeDelta<0||winner.runtimeDelta>2
    ||winner.yearMismatch!==false||winner.sequelConflict===true)return false
  const ids=new Set([winner.tmdbId])
  return results.slice(1).every(other=>{
    if(!Number.isInteger(other?.tmdbId)||other.tmdbId<=0||ids.has(other.tmdbId)
      ||other.titleLevel!==4||other.yearMismatch!==true
      ||other.sequelConflict===true
      ||!Number.isFinite(other.score)||other.score>28
      ||winner.score-other.score<14
      ||!Number.isFinite(other.runtimeDelta)||other.runtimeDelta<0)return false
    ids.add(other.tmdbId)
    return true
  })
}
