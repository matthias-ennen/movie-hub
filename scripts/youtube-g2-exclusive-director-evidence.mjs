/**
 * Source explicitly naming a film director is review-only evidence.
 * TMDB /movie credits.crew must confirm Director for exactly one complete
 * movie candidate. This never proves the YouTube video, its cut, availability,
 * copyright or German offer.
 */
const normalize=s=>String(s??'').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim()
const unsafe=/\b(?:trailer|teaser|clip|preview|ausschnitt|uncut|bootleg)\b/iu

export function explicitBilledDirector(sourceTitle){
  const source=String(sourceTitle??'')
  if(unsafe.test(source))return null
  // Both observed publisher spellings: John Carpenter's Sie leben,
  // John Carpenters Vampire. Missing apostrophe does not by itself
  // establish a director: the TMDB credits still must match.
  const match=source.match(/^([A-ZÄÖÜ][\p{L}.'-]{1,30}\s+[A-ZÄÖÜ][\p{L}.'-]{1,30})['’]s\s+\S/u)
    ||source.match(/^([A-ZÄÖÜ][\p{L}.'-]{1,30}\s+[A-ZÄÖÜ][\p{L}.'-]{1,30}?)s\s+\S/u)
  return match?match[1]:null
}

export function applyExplicitDirectorGuard(sourceTitle,scores=[],tmdbFilms=[]){
  const director=explicitBilledDirector(sourceTitle)
  const original={scores:[...scores],evidence:{director,
    evidence:'none',creditedMovieIds:[],affectsRanking:false}}
  if(!director||!Array.isArray(scores)||scores.length<2||scores.length>3)return original
  const films=new Map((tmdbFilms||[]).map(f=>[Number(f?.id),f]))
  if(scores.some(s=>!Array.isArray(films.get(Number(s.tmdbId))?.credits?.crew)))
    return {...original,evidence:{...original.evidence,evidence:'incomplete-director-credits'}}
  const matched=scores.filter(s=>films.get(Number(s.tmdbId)).credits.crew
    .some(person=>person?.job==='Director'&&
      (normalize(person.name)===normalize(director)
        ||normalize(person.original_name)===normalize(director))))
  if(matched.length!==1)return {...original,evidence:{...original.evidence,
    evidence:'director-not-exclusive',creditedMovieIds:matched.map(s=>s.tmdbId)}}
  const id=Number(matched[0].tmdbId)
  return {scores:scores.map(s=>({...s,
    score:s.score+(Number(s.tmdbId)===id?12:-20),
    creditedDirectorMatches:Number(s.tmdbId)===id})),
  evidence:{director,evidence:'matched-exclusive-tmdb-director',
    creditedMovieIds:[id],affectsRanking:true}}
}

/** A strongly credited feature film with irrelevant fuzzy TV /search hits. */
export function hasExclusiveDirectorFeatureFilmEvidence(sourceTitle,row){
  const director=explicitBilledDirector(sourceTitle)
  const evidence=row?.directorEvidence
  const movies=row?.topCandidates
  const winner=Array.isArray(movies)?movies[0]:null
  const tv=row?.tvSearchEvidence
  const tvIds=row?.alternativeTvIds
  if(!director||row?.videoTitle!==sourceTitle
    ||row?.matchStatus!=='review-leading-movie-with-TV-alternatives'
    ||row.identityRisk!==null||row.sourceVideoDetailAvailable!==true
    ||!Array.isArray(row.errors)||row.errors.length!==0
    ||evidence?.evidence!=='matched-exclusive-tmdb-director'
    ||evidence.affectsRanking!==true||evidence.director!==director
    ||!Array.isArray(evidence.creditedMovieIds)
    ||evidence.creditedMovieIds.length!==1
    ||!Array.isArray(movies)||(movies.length!==2&&movies.length!==3)
    ||!Number.isInteger(winner?.tmdbId)||winner.tmdbId<=0
    ||evidence.creditedMovieIds[0]!==winner.tmdbId
    ||winner.creditedDirectorMatches!==true
    ||winner.titleLevel!==4||!Number.isFinite(winner.score)||winner.score<50
    ||!Number.isFinite(winner.runtimeDelta)||winner.runtimeDelta<0
    ||winner.runtimeDelta>3||winner.yearMismatch===true
    ||winner.sequelConflict===true
    ||!Array.isArray(tvIds)||tvIds.length===0
    ||!Array.isArray(tv?.alternativeTvIds)
    ||tvIds.length!==tv.alternativeTvIds.length
    ||tvIds.some((id,i)=>id!==tv.alternativeTvIds[i])
    ||!Array.isArray(tv?.candidates))return false
  // Both localized AND original TV titles are nonempty and lack even shared
  // distinguishing movie vocabulary. Year must be documented and >=5 years
  // away. Unknown / same-name / related / contemporary TV work stays blocked.
  const seenTv=new Set()
  if(!tvIds.every(id=>{
    const t=tv.candidates.find(c=>c.tmdbTvId===id)
    if(!Number.isInteger(id)||id<=0||seenTv.has(id)||!t
      ||t.disposition!=='retained-for-film-tv-review'
      ||!t.name||!t.originalName||t.titleOverlap!==false
      ||t.wholeFilmTitleMatch!==false
      ||!Number.isInteger(t.firstAirYear)||!Number.isFinite(t.yearGap)
      ||t.yearGap<5)return false
    seenTv.add(id)
    return true
  }))return false
  const movieIds=new Set([winner.tmdbId])
  return movies.slice(1).every(m=>{
    if(!Number.isInteger(m?.tmdbId)||m.tmdbId<=0
      ||movieIds.has(m.tmdbId)||!Number.isFinite(m.score)
      ||m.titleLevel>2||!Number.isFinite(m.titleLevel)
      ||m.score>12||winner.score-m.score<35
      ||m.creditedDirectorMatches!==false
      ||m.yearMismatch===true||m.sequelConflict===true)return false
    movieIds.add(m.tmdbId)
    return true
  })
}
