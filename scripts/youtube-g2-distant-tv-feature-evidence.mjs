/**
 * A source from the two specifically declared MOVIE playlists may have TMDB
 * /search/tv namesakes decades away from a sharply identified feature film.
 * They are not evidence that the original video contains a TV episode.
 *
 * This only grants a provisional editorial watch link after film identity,
 * runtime and every TV search result is independently screened. It is never
 * a verified DE offer or permission to discard unknown/contemporary TV works.
 */
const trailer=/\b(?:trailer|teaser|preview|clip|ausschnitt|bootleg|uncut)\b/iu
const positiveNumber=x=>Number.isInteger(x)&&x>0
export function hasDistantTvNamesakeFeatureFilmEvidence(sourceTitle,row){
  const c=row?.topCandidates
  const top=Array.isArray(c)?c[0]:null
  const tv=row?.tvSearchEvidence
  const alternatives=row?.alternativeTvIds
  if(typeof sourceTitle!=='string'||sourceTitle.length<5
    ||trailer.test(sourceTitle)||row?.videoTitle!==sourceTitle
    ||row?.matchStatus!=='review-leading-movie-with-TV-alternatives'
    ||row.identityRisk!==null||row.sourceVideoDetailAvailable!==true
    ||!Array.isArray(row.errors)||row.errors.length!==0
    ||!Array.isArray(alternatives)||alternatives.length===0
    ||!Array.isArray(tv?.alternativeTvIds)
    ||tv.alternativeTvIds.length!==alternatives.length
    ||tv.alternativeTvIds.some((id,i)=>id!==alternatives[i])
    ||!Array.isArray(tv.candidates)
    ||!Array.isArray(c)||(c.length!==2&&c.length!==3)
    ||!positiveNumber(top?.tmdbId)||top.titleLevel!==4
    ||!Number.isFinite(top.score)||top.score<38
    ||!Number.isFinite(top.runtimeDelta)||top.runtimeDelta<0
    ||top.runtimeDelta>4||top.yearMismatch===true
    ||top.sequelConflict===true)return false
  // A TV result must have a verifiable first-air date, correspond to the
  // matched full movie name, and be >=25 years away. Unknown years, nearby
  // series, or unaccounted TV IDs all block this fallback.
  const ids=new Set()
  if(!alternatives.every(id=>{
    const hit=tv.candidates.find(t=>t.tmdbTvId===id)
    if(!positiveNumber(id)||ids.has(id)||!hit
      ||hit.disposition!=='retained-for-film-tv-review'
      ||hit.wholeFilmTitleMatch!==true
      ||!Number.isInteger(hit.firstAirYear)
      ||!Number.isInteger(hit.yearGap)||hit.yearGap<25)return false
    ids.add(id)
    return true
  }))return false
  const seen=new Set([top.tmdbId])
  return c.slice(1).every(r=>{
    if(!positiveNumber(r?.tmdbId)||seen.has(r.tmdbId)
      ||!Number.isFinite(r.score)||!Number.isFinite(r.titleLevel)
      ||r.yearMismatch===true||r.sequelConflict===true)return false
    seen.add(r.tmdbId)
    // Every competing MOVIE must be demonstrably inferior, either by
    // title identity or by a *very* different full-film duration.
    if(r.titleLevel<=2)return top.score-r.score>=16&&r.score<=22
    return r.titleLevel===4&&Number.isFinite(r.runtimeDelta)
      &&r.runtimeDelta>=60&&r.score<=23&&top.score-r.score>=15
  })
}
