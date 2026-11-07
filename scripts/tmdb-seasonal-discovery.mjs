// Nightly-only TMDB thematic/quality discovery. No client-side API traffic.
// Reuses one canonical movie/series identity per TMDB id in generate-tmdb-catalog.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const SEASONAL_DISCOVERY_FILE = 'public/seasonal-discovery.json'
export const SEASONAL_DISCOVERY_VERSION = 3
export const SEASONAL_REFRESH_AGE_MS = 7 * 86400000
// Eight season strategies + quality, movie and TV, each with <=2 pages.
// Strict global discovery budget excludes the eight bounded keyword lookups.
export const SEASONAL_PAGE_BUDGET = 36
export const SEASONAL_PAGE_LIMIT_PER_STRATEGY = 2
const THEMES = Object.freeze([
  { id: 'halloween', keywords: ['halloween'], exact: true },
  { id: 'christmas', keywords: ['christmas'], exact: true },
  { id: 'easter', keywords: ['easter'], exact: true },
  { id: 'pentecost', keywords: ['pentecost'], fallback: 'family' },
  { id: 'newyear', keywords: ['new year'], fallback: 'highlights' },
  { id: 'filmfestival', keywords: ['film festival'], fallback: 'film-art' },
  { id: 'hollywood', keywords: ['hollywood'], fallback: 'highlights' },
  { id: 'summer-cinema', keywords: ['summer'], fallback: 'adventure' },
])
const STRATEGY_IDS = Object.freeze([...THEMES.map(t => t.id), 'quality'])
const MEDIA_TYPES = ['movie', 'tv']
const MAX_IDS_PER_STRATEGY = 20

const unique = values => [...new Set(values)]
const validCandidate = c => Number.isInteger(c?.id) && c.id > 0
  && ['movie', 'tv'].includes(c?.mediaType)

export function validateSeasonalDiscovery(value) {
  // v1/v2 snapshots remain valid for rollback and code-only restores,
  // but the next actual discovery upgrades them to the mixed festival
  // strategy even if the old generation is younger than seven days.
  const version = value?.version
  if(![1,2,SEASONAL_DISCOVERY_VERSION].includes(version))return false
  const ids = version === 1
    ? ['halloween','christmas','easter','pentecost','quality'] : STRATEGY_IDS
  const count = ids.length * MEDIA_TYPES.length
  const pageLimit = version === 1 ? 3 : SEASONAL_PAGE_LIMIT_PER_STRATEGY
  const pageBudget = version === 1 ? 30 : SEASONAL_PAGE_BUDGET
  const keywordBudget = version === 1 ? 4 : THEMES.length
  if (value.kind !== 'moviehub-seasonal-discovery'
    || !Number.isFinite(Date.parse(value.generatedAt))
    || !Array.isArray(value.strategies) || value.strategies.length !== count
    || !Number.isInteger(value.pagesFetched) || value.pagesFetched < 0
    || value.pagesFetched > pageBudget
    || !Number.isInteger(value.keywordLookups) || value.keywordLookups < 0
    || value.keywordLookups > keywordBudget
    || !Number.isInteger(value.uniqueCandidates) || value.uniqueCandidates < 0) return false
  const seen = new Set()
  for (const strategy of value.strategies) {
    if (!strategy || !ids.includes(strategy.id)
      || !MEDIA_TYPES.includes(strategy.mediaType)
      || !(version === 1 ? ['complete','no-keyword']
        : ['complete','no-keyword','fallback']).includes(strategy.status)
      || !Array.isArray(strategy.candidates) || strategy.candidates.length > MAX_IDS_PER_STRATEGY
      || !Number.isInteger(strategy.pagesFetched) || strategy.pagesFetched < 0
      || strategy.pagesFetched > pageLimit) return false
    if (!strategy.candidates.every(c => validCandidate(c) && c.mediaType === strategy.mediaType))return false
    if (strategy.status === 'no-keyword' && (strategy.candidates.length || strategy.pagesFetched))return false
    const key = `${strategy.id}:${strategy.mediaType}`
    if (seen.has(key))return false
    seen.add(key)
  }
  if (value.strategies.reduce((sum,s)=>sum+s.pagesFetched,0)!==value.pagesFetched) return false
  const keys=unique(value.strategies.flatMap(s=>s.candidates.map(c=>`${c.mediaType}:${c.id}`)))
  return keys.length===value.uniqueCandidates
}

export function seasonalDiscoverParams({ id, mediaType, keywordId, fallback }, page) {
  const params = {
    language:'de-DE', include_adult:false, page,
    watch_region:'DE', with_watch_monetization_types:'flatrate|free|ads|rent|buy',
    sort_by: id==='quality' || fallback==='film-art' ? 'vote_average.desc' : 'popularity.desc',
    ...(mediaType==='movie' ? { region:'DE' } : {}),
  }
  if(id==='quality'){
    params['vote_average.gte']=7.5
    params['vote_count.gte']=mediaType==='movie'?400:150
  }else if(Number.isInteger(keywordId)&&keywordId>0) {
    params.with_keywords=keywordId
  }else if(fallback){
    // Editorial discovery is labelled accordingly. Neither family/adventure
    // genres nor ratings assert a holiday, film festival or awards win.
    if(fallback==='family')params.with_genres='10751'
    if(fallback==='adventure')params.with_genres=mediaType==='movie'?'12':'10759'
    if(fallback==='highlights' || fallback==='film-art'){
      params['vote_average.gte']=fallback==='film-art'?7.2:7.4
      params['vote_count.gte']=mediaType==='movie'?250:120
    }
  }else throw Error('INVALID_SEASONAL_KEYWORD')
  return params
}

export async function buildSeasonalDiscovery({
  request, generatedAt = new Date().toISOString(),
} = {}) {
  if(typeof request!=='function')throw Error('SEASONAL_TMDB_REQUEST_REQUIRED')
  const keywordIds = new Map()
  for(const theme of THEMES){
    const result = await request('/search/keyword', { query:theme.keywords[0], page:1 })
    const exact = (Array.isArray(result?.results) ? result.results : [])
      .find(x => theme.keywords.includes(String(x?.name||'').trim().toLowerCase())
        && Number.isInteger(Number(x?.id)) && Number(x.id)>0)
    keywordIds.set(theme.id, exact ? Number(exact.id) : null)
  }
  const strategies=[]
  for(const spec of [...THEMES, {id:'quality'}]){
    for(const mediaType of MEDIA_TYPES){
      const keywordId=keywordIds.get(spec.id)
      if(spec.id!=='quality'&&!keywordId && !spec.fallback){
        strategies.push({id:spec.id,mediaType,status:'no-keyword',keywordId:null,
          pagesFetched:0,candidates:[]})
        continue
      }
      const candidates=[]
      const seen=new Set()
      let totalPages=1
      let pagesFetched=0
      // A festival keyword is not a reliable list of festival selections,
      // and a popular/highly rated title is not proof of festival attendance.
      // Reserve one of the two bounded pages for broadly available film art,
      // even when the exact keyword exists. Publish this as an editorial
      // "Kino-Entdeckungen" row, never as festival winners or nominees.
      const mixedFestival=spec.id==='filmfestival'
      for(let page=1;page<=SEASONAL_PAGE_LIMIT_PER_STRATEGY;page++){
        if(!mixedFestival && page>totalPages)break
        const editorialFestival=mixedFestival && (!keywordId || page===2)
        const fetchPage=mixedFestival && keywordId ? 1 : page
        const effectiveKeyword=editorialFestival?null:keywordId
        const effectiveFallback=editorialFestival?'film-art':(keywordId?null:spec.fallback)
        const params=seasonalDiscoverParams({id:spec.id,mediaType,keywordId:effectiveKeyword,fallback:effectiveFallback},fetchPage)
        const result=await request(`/discover/${mediaType}`,params)
        if(!Number.isFinite(Number(result?.total_pages))||!Array.isArray(result?.results))
          throw Error('SEASONAL_TMDB_INCOMPLETE_RESPONSE')
        totalPages=Math.max(1,Math.min(500,Math.floor(Number(result.total_pages))))
        pagesFetched++
        for(const entry of result.results){
          const id=Number(entry?.id)
          if(!Number.isInteger(id)||id<=0||seen.has(id))continue
          seen.add(id)
          if(entry.adult===true)continue
          if((spec.id==='quality' || ['highlights','film-art'].includes(effectiveFallback))
            && (Number(entry.vote_average)<(effectiveFallback==='film-art'?7.2:spec.id==='quality'?7.5:7.4)
            || Number(entry.vote_count)<(spec.id==='quality'?(mediaType==='movie'?400:150):(mediaType==='movie'?250:120))))continue
          candidates.push({id,mediaType})
          // Ten genuine TMDB keyword candidates + ten editorial candidates
          // when both searches exist: ensures the second page can add films.
          if(candidates.length===(mixedFestival && page===1 && keywordId?10:MAX_IDS_PER_STRATEGY))break
        }
        if(candidates.length===MAX_IDS_PER_STRATEGY)break
      }
      strategies.push({id:spec.id,mediaType,status:spec.id!=='quality'&&!keywordId?'fallback':'complete',keywordId:keywordId||null,
        pagesFetched,candidates})
    }
  }
  const snapshot={
    kind:'moviehub-seasonal-discovery',version:SEASONAL_DISCOVERY_VERSION,
    generatedAt, keywordLookups:THEMES.length, pagesFetched:strategies.reduce((n,s)=>n+s.pagesFetched,0),
    uniqueCandidates:unique(strategies.flatMap(s=>s.candidates.map(c=>`${c.mediaType}:${c.id}`))).length,
    strategies,
  }
  if(!validateSeasonalDiscovery(snapshot))throw Error('SEASONAL_DISCOVERY_INVALID')
  return snapshot
}

export function seasonalDiscoveryRows(snapshot) {
  if(!validateSeasonalDiscovery(snapshot))return []
  return snapshot.strategies.filter(s=>['complete','fallback'].includes(s.status)&&s.candidates.length>=6)
    .map(s=>({
      id:`themed-${s.id}-${s.mediaType==='movie'?'movies':'series'}`,
      seasonId:s.id==='quality'?null:s.id,
      discoveryKind:s.id==='quality'?'quality':'seasonal',
      mediaType:s.mediaType,
      title:s.id==='quality'
        ?(s.mediaType==='movie'?'Besonders gut bewertete Filme':'Besonders gut bewertete Serien')
        : ({
          halloween:'Halloween',christmas:'Weihnachten',easter:'Ostern',pentecost:'Pfingsten',
          newyear:s.status==='fallback'?'Filmhighlights zum Jahreswechsel':'Silvester & Neujahr',
          filmfestival:'Internationale Kino-Entdeckungen',
          hollywood:s.status==='fallback'?'Großes Kino':'Hollywood',
          'summer-cinema':s.status==='fallback'?'Sommerliche Abenteuer':'Sommerkino',
        }[s.id]+' · '+(s.mediaType==='movie'?'Filme':'Serien')),
      candidates:s.candidates,
      limit:20,
    }))
}

export async function readSeasonalDiscovery(path=resolve(SEASONAL_DISCOVERY_FILE)) {
  try {
    const value=JSON.parse(await readFile(path,'utf8'))
    return validateSeasonalDiscovery(value)?value:null
  } catch {return null}
}

export async function refreshSeasonalDiscovery({
  request, now=new Date(), path=resolve(SEASONAL_DISCOVERY_FILE), force=false, requireFresh=false,
}={}){
  const previous=await readSeasonalDiscovery(path)
  const current=now instanceof Date?now:new Date(now)
  if(!force && previous?.version===SEASONAL_DISCOVERY_VERSION && current.getTime()-Date.parse(previous.generatedAt)>=0
    &&current.getTime()-Date.parse(previous.generatedAt)<SEASONAL_REFRESH_AGE_MS){
    console.log(`Seasonal TMDB discovery: reuse ${previous.generatedAt}, ${previous.uniqueCandidates} candidate IDs, 0 API requests.`)
    return previous
  }
  try{
    const snapshot=await buildSeasonalDiscovery({request,generatedAt:current.toISOString()})
    await writeFile(path,JSON.stringify(snapshot)+'\n','utf8')
    console.log(`Seasonal TMDB discovery: ${snapshot.keywordLookups} keyword lookups, ${snapshot.pagesFetched} discovery pages, ${snapshot.uniqueCandidates} unique candidates.`)
    return snapshot
  }catch(error){
    if(requireFresh)throw error
    if(!previous){
      console.warn('Seasonal discovery unavailable: keeping core TMDB catalog unchanged',error.message)
      return null
    }
    console.warn('Seasonal discovery refresh failed: keeping last verified generation',error.message)
    return previous
  }
}
