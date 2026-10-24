/**
 * G2 read-only TV search evidence.
 *
 * TMDB /search/tv is a fuzzy discovery endpoint, NOT an identity proof.
 * Discard a TV result as clearly unrelated search noise only when BOTH
 * localized/original TV names are present, neither contains the complete
 * searched/canonical film title, AND its explicit first-air year
 * differs from the canonical movie's release year by at least ten years.
 *
 * Any unknown, matching, translated-but-unproven, or contemporary hit stays a
 * blocking TV alternative. This never verifies YouTube playback or offers.
 */
const positiveId=value=>Number.isInteger(Number(value))&&Number(value)>0?Number(value):null
const year=value=>{
  const found=/^((?:18|19|20)\d{2})-\d{2}-\d{2}$/.exec(String(value??''))
  return found?Number(found[1]):null
}
const ignore=new Set([
  'the','and','with','from','this','that','film','movie','series','show',
  'eine','einer','einem','einen','eines','der','die','das','dem','den',
  'und','mit','von','bei','zum','zur','des','ein','auf','aus','fur',
])
const tokens=value=>{
  const normalized=String(value??'').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/ß/gu,'ss')
    .toLocaleLowerCase('de-DE').replace(/[^a-z0-9]+/g,' ')
  return normalized.trim().split(/\s+/u)
    .filter(x=>x.length>=4&&!ignore.has(x))
}
const anyCommon=(known,candidate)=>candidate.some(word=>known.has(word))
const matchesFullFilmName=(movieAliases,tvWords)=>
  movieAliases.some(alias=>{
    if(alias.length===0||tvWords.length===0)return false
    // One-word movies (Heat, Basic): only the WHOLE TV title counts.
    // For multi-word movies, permit an intact film-name phrase inside a
    // qualified spin-off title, but not disconnected vocabulary overlap
    // such as 'Street Outlaws: No Prep Kings' for 'Street Kings'.
    if(alias.length===1)return tvWords.length===1&&tvWords[0]===alias[0]
    // The same *complete* title tokens may be reordered in translations;
    // retain that as a genuine work-identity ambiguity. Extra unrelated
    // tokens (Street Outlaws No Prep Kings) are not the same whole title.
    if(alias.length===tvWords.length
      &&[...alias].sort().join(' ')===[...tvWords].sort().join(' '))return true
    for(let start=0;start<=tvWords.length-alias.length;start++){
      if(alias.every((word,index)=>tvWords[start+index]===word))return true
    }
    return false
  })


export function reviewTvSearchAlternatives({sourceTitle,movie,tvResults=[]}={}){
  if(!Array.isArray(tvResults))throw Error('YOUTUBE_TV_EVIDENCE_RESULTS_INVALID')
  const movieYear=year(movie?.release_date)
  const filmAliases=[
    sourceTitle,movie?.title,movie?.original_title,
    ...(Array.isArray(movie?.alternative_titles?.titles)
      ?movie.alternative_titles.titles.map(x=>x?.title).slice(0,40):[]),
  ]
  const aliasSequences=filmAliases.map(tokens).filter(x=>x.length>0)
  const filmWords=new Set(aliasSequences.flat())
  const candidates=[]
  const ids=new Set()
  for(const result of tvResults){
    const id=positiveId(result?.id)
    if(!id||ids.has(id))continue
    ids.add(id)
    const name=String(result?.name??'').slice(0,160).trim()
    const originalName=String(result?.original_name??'').slice(0,160).trim()
    const firstAirYear=year(result?.first_air_date)
    const tvWords=tokens(name).concat(tokens(originalName))
    const titleOverlap=anyCommon(filmWords,tvWords)
    const wholeFilmTitleMatch=[tokens(name),tokens(originalName)]
      .some(words=>matchesFullFilmName(aliasSequences,words))
    const yearGap=movieYear!==null&&firstAirYear!==null
      ?Math.abs(movieYear-firstAirYear):null
    const clearlyUnrelated=Boolean(
      name&&originalName&&movieYear!==null&&firstAirYear!==null
      &&filmWords.size>0&&tvWords.length>0&&!wholeFilmTitleMatch
      &&yearGap>=10)
    candidates.push({
      tmdbTvId:id,name,originalName,firstAirYear,
      yearGap,titleOverlap,wholeFilmTitleMatch,disposition:clearlyUnrelated
        ?'clearly-unrelated-search-hit':'retained-for-film-tv-review',
    })
    if(candidates.length===3)break
  }
  return {
    rawTvIds:candidates.map(x=>x.tmdbTvId),
    alternativeTvIds:candidates.filter(x=>
      x.disposition==='retained-for-film-tv-review').map(x=>x.tmdbTvId),
    unrelatedTvIds:candidates.filter(x=>
      x.disposition==='clearly-unrelated-search-hit').map(x=>x.tmdbTvId),
    candidates,
  }
}
