/**
 * Narrow, source-explicit historical release-year evidence. Supports
 * YEAR-annotated full movie titles without weakening ordinary same-title,
 * remake, actor, cut, or TV rules.
 *
 * All candidates still come from TMDB; publisher year is a *review clue*,
 * NOT film verification or a proof of playback/country/rights.
 */
const terminalParenthetical=/^(.{9,100}?)\s+\(((?:19|20)\d{2})\)$/u
const terminalDash=/^(.{9,100}?)\s+-\s+((?:19|20)\d{2})$/u
const danger=/\b(?:trailer|teaser|clip|preview|ausschnitt|uncut|ungek[uü]rzt|director['’]s cut|bootleg)\b/iu
const permittedReasons=new Set([
  'terminal-year-multiword-film-title',
  'time-machine-1960-original-title',
])
const finite=id=>Number.isInteger(id)&&id>0

export function hasExclusiveHistoricalYearFilmHypothesis(sourceTitle,row){
  const source=String(sourceTitle??'').trim()
  const match=source.match(terminalParenthetical)||source.match(terminalDash)
  const year=match?Number(match[2]):null
  const c=row?.topCandidates
  const winner=Array.isArray(c)?c[0]:null
  if(!match||danger.test(source)||match[1].trim().split(/\s+/u).length<3
    ||year<1920||year>2015
    ||row?.videoTitle!==source
    ||!permittedReasons.has(row.curatedQueryReason)
    ||row.reportedSourceYear!==year
    ||row.matchStatus!=='review-leading-film-hypothesis'
    ||row.identityRisk!==null||!Array.isArray(row.errors)||row.errors.length!==0
    ||!Array.isArray(row.alternativeTvIds)||row.alternativeTvIds.length!==0
    ||!Array.isArray(c)||(c.length!==2&&c.length!==3)
    ||!finite(winner?.tmdbId)||winner.titleLevel!==4
    ||!Number.isFinite(winner.score)||winner.score<42
    ||!Number.isFinite(winner.runtimeDelta)||winner.runtimeDelta<0
    ||winner.runtimeDelta>3||winner.yearMismatch!==false
    ||winner.sequelConflict===true)return false

  const seen=new Set([winner.tmdbId])
  return c.slice(1).every(other=>{
    if(!finite(other?.tmdbId)||seen.has(other.tmdbId)
      ||other.yearMismatch!==true||other.sequelConflict===true
      ||!Number.isFinite(other.score)||other.score>30
      ||winner.score-other.score<14
      ||!Number.isFinite(other.titleLevel)||other.titleLevel>4
      ||!Number.isFinite(other.runtimeDelta)||other.runtimeDelta<0)return false
    seen.add(other.tmdbId)
    return true
  })
}
