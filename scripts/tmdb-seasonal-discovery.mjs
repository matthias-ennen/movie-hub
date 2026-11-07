// Nightly-only TMDB thematic/quality discovery. No client-side API traffic.
// Reuses one canonical movie/series identity per TMDB id in generate-tmdb-catalog.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const SEASONAL_DISCOVERY_FILE = 'public/seasonal-discovery.json'
export const SEASONAL_DISCOVERY_VERSION = 1
export const SEASONAL_REFRESH_AGE_MS = 7 * 86400000
export const SEASONAL_PAGE_BUDGET = 30
export const SEASONAL_PAGE_LIMIT_PER_STRATEGY = 3
const THEMES = Object.freeze([
  { id: 'halloween', keywords: ['halloween'] },
  { id: 'christmas', keywords: ['christmas'] },
  { id: 'easter', keywords: ['easter'] },
  { id: 'pentecost', keywords: ['pentecost'] },
])
const MEDIA_TYPES = ['movie', 'tv']
const MAX_IDS_PER_STRATEGY = 20

const unique = values => [...new Set(values)]
const validCandidate = c => Number.isInteger(c?.id) && c.id > 0
  && ['movie', 'tv'].includes(c?.mediaType)

export function validateSeasonalDiscovery(value) {
  if (value?.kind !== 'moviehub-seasonal-discovery' || value.version !== SEASONAL_DISCOVERY_VERSION
    || !Number.isFinite(Date.parse(value.generatedAt))
    || !Array.isArray(value.strategies) || value.strategies.length !== 10
    || !Number.isInteger(value.pagesFetched) || value.pagesFetched < 0
    || value.pagesFetched > SEASONAL_PAGE_BUDGET
    || !Number.isInteger(value.keywordLookups) || value.keywordLookups < 0 || value.keywordLookups > 4
    || !Number.isInteger(value.uniqueCandidates) || value.uniqueCandidates < 0) return false
  const ids = new Set()
  for (const strategy of value.strategies) {
    if (!strategy || !['halloween','christmas','easter','pentecost','quality'].includes(strategy.id)
      || !MEDIA_TYPES.includes(strategy.mediaType)
      || !['complete','no-keyword'].includes(strategy.status)
      || !Array.isArray(strategy.candidates) || strategy.candidates.length > MAX_IDS_PER_STRATEGY
      || !Number.isInteger(strategy.pagesFetched) || strategy.pagesFetched < 0
      || strategy.pagesFetched > SEASONAL_PAGE_LIMIT_PER_STRATEGY) return false
    if (!strategy.candidates.every(c => validCandidate(c) && c.mediaType === strategy.mediaType)) return false
    const key = `${strategy.id}:${strategy.mediaType}`
    if (ids.has(key)) return false
    ids.add(key)
  }
  if (value.strategies.reduce((sum,s)=>sum+s.pagesFetched,0)!==value.pagesFetched) return false
  const keys=unique(value.strategies.flatMap(s=>s.candidates.map(c=>`${c.mediaType}:${c.id}`)))
  return keys.length===value.uniqueCandidates
}

export function seasonalDiscoverParams({ id, mediaType, keywordId }, page) {
  const params = {
    language:'de-DE', include_adult:false, page,
    watch_region:'DE', with_watch_monetization_types:'flatrate|free|ads|rent|buy',
    sort_by: id==='quality' ? 'vote_average.desc' : 'popularity.desc',
    ...(mediaType==='movie' ? { region:'DE' } : {}),
  }
  if(id==='quality'){
    params['vote_average.gte']=7.5
    params['vote_count.gte']=mediaType==='movie'?400:150
  }else{
    if(!Number.isInteger(keywordId)||keywordId<=0)throw Error('INVALID_SEASONAL_KEYWORD')
    params.with_keywords=keywordId
  }
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
      if(spec.id!=='quality'&&!keywordId){
        strategies.push({id:spec.id,mediaType,status:'no-keyword',keywordId:null,
          pagesFetched:0,candidates:[]})
        continue
      }
      const candidates=[]
      const seen=new Set()
      let totalPages=1
      let pagesFetched=0
      for(let page=1;page<=Math.min(SEASONAL_PAGE_LIMIT_PER_STRATEGY,totalPages);page++){
        const params=seasonalDiscoverParams({id:spec.id,mediaType,keywordId},page)
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
          if(spec.id==='quality' && (Number(entry.vote_average)<7.5
            ||Number(entry.vote_count)<(mediaType==='movie'?400:150)))continue
          candidates.push({id,mediaType})
          if(candidates.length===MAX_IDS_PER_STRATEGY)break
        }
        if(candidates.length===MAX_IDS_PER_STRATEGY)break
      }
      strategies.push({id:spec.id,mediaType,status:'complete',keywordId:keywordId||null,
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
  return snapshot.strategies.filter(s=>s.status==='complete'&&s.candidates.length>=6)
    .map(s=>({
      id:`themed-${s.id}-${s.mediaType==='movie'?'movies':'series'}`,
      seasonId:s.id==='quality'?null:s.id,
      discoveryKind:s.id==='quality'?'quality':'seasonal',
      mediaType:s.mediaType,
      title:s.id==='quality'
        ?(s.mediaType==='movie'?'Besonders gut bewertete Filme':'Besonders gut bewertete Serien')
        : ({
          halloween:'Halloween',christmas:'Weihnachten',easter:'Ostern',pentecost:'Pfingsten',
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
  if(!force && previous && current.getTime()-Date.parse(previous.generatedAt)>=0
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
    if(!previous){
      console.warn('Seasonal discovery unavailable: keeping core TMDB catalog unchanged',error.message)
      return null
    }
    console.warn('Seasonal discovery refresh failed: keeping last verified generation',error.message)
    return previous
  }
}
