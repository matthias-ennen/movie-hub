/** Private, opt-in raw TMDB response cache. Never stores a matcher decision,
 * a YouTube offer, availability, or a published link. No CLI activation. */
import {createHash} from 'node:crypto'
import {copySafeTmdbResponse,sharedTmdbRequestPath} from './shared-tmdb-search-response-cache.mjs'

const DAY=86400000
const KIND='youtube-g2-private-tmdb-response-cache'
const MAX_ENTRIES=12000
const MAX_BYTES=64*1024*1024
const MAX_RESPONSE_BYTES=512*1024
const BUCKET='movie-hub-62459-nightly-checkpoints'
export const YOUTUBE_TMDB_CACHE_OBJECT='youtube-g2/private-playlist-tmdb-cache/v1/latest.json'
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const hash=x=>createHash('sha256').update(x).digest('hex')
const stable=x=>Array.isArray(x)?x.map(stable):object(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x

// TMDB defaults page to 1. Only this exact alias is normalized; all other
// filters, query spelling and languages remain distinct.
export function sharedYoutubeSearchKey(path,params){
  if(!object(params))return null
  const year=path==='/search/movie'?'year':'first_air_date_year'
  if(Object.keys(params).some(k=>!['language','query','include_adult','page',year].includes(k))
    ||('page' in params&&params.page!==1&&params.page!=='1'))return null
  const {language,query,include_adult}=params
  const canonical={language,query,include_adult}
  if(year in params)canonical[year]=params[year]
  const key=JSON.stringify([path,canonical])
  return sharedTmdbRequestPath(key)?key:null
}
export function youtubeTmdbKey(path,params){
  const shared=sharedYoutubeSearchKey(path,params)
  if(shared)return shared
  if(!/^\/movie\/[1-9]\d*$/.test(path)||!object(params)
    ||Object.keys(params).length!==2
    ||!/^([a-z]{2})-([A-Z]{2})$/.test(params.language)
    ||params.append_to_response!=='alternative_titles,credits,external_ids')return null
  return JSON.stringify([path,{language:params.language,append_to_response:params.append_to_response}])
}
function safeResponse(key,value){
  const [path]=JSON.parse(key)
  if(sharedTmdbRequestPath(key)){
    const copy=copySafeTmdbResponse(value,path)
    // A partial/wrong page must not masquerade as an empty search.
    return copy&&(copy.page===undefined||copy.page===1)
      &&!(copy.results.length===0&&Number(copy.total_results)>0)?copy:null
  }
  if(!object(value)||value.success===false||value.status_code!=null
    ||value.error!=null||value.errors!=null||!Number.isSafeInteger(value.id)
    ||String(value.id)!==path.slice(7)||typeof value.title!=='string'||!value.title.trim()
    ||!Array.isArray(value.alternative_titles?.titles)||!Array.isArray(value.credits?.cast)
    ||!Array.isArray(value.credits?.crew)||!object(value.external_ids))return null
  try{
    const raw=JSON.stringify(value)
    return Buffer.byteLength(raw)<=MAX_RESPONSE_BYTES?JSON.parse(raw):null
  }catch{return null}
}
const negative=value=>Array.isArray(value.results)&&value.results.length===0
const stages=value=>negative(value)?[2,4,8,16]:[7,14,28,56]
const fingerprint=value=>hash(JSON.stringify(stable(value)))
const expires=entry=>entry.checkedAt+entry.ttlDays*DAY
const validTime=x=>Number.isSafeInteger(x)&&x>=0
const copy=value=>JSON.parse(JSON.stringify(value))

export function createAdaptiveYoutubeTmdbCache({snapshot=null,now=Date.now}={}){
  const entries=new Map()
  const counters={hits:0,misses:0,expired:0,recorded:0,renewed:0,changed:0,rejected:0,evicted:0}
  const clock=()=>{const t=now();if(!validTime(t))throw Error('YOUTUBE_CACHE_CLOCK_INVALID');return t}
  let bytes=0
  const entryBytes=e=>Buffer.byteLength(JSON.stringify(e))+1
  function insert(entry){
    const prior=entries.get(entry.key)
    if(prior){bytes-=entryBytes(prior);entries.delete(entry.key)}
    entries.set(entry.key,entry);bytes+=entryBytes(entry)
    // Keep recent observations, including expired evidence for comparison.
    while(entries.size>MAX_ENTRIES||bytes>MAX_BYTES-1024){
      const first=entries.values().next().value
      entries.delete(first.key);bytes-=entryBytes(first);counters.evicted++
    }
  }
  if(snapshot!==null){
    if(snapshot?.kind!==KIND||snapshot.schemaVersion!==1||!Array.isArray(snapshot.entries)
      ||snapshot.entries.length>MAX_ENTRIES
      ||Buffer.byteLength(JSON.stringify(snapshot))>MAX_BYTES)throw Error('YOUTUBE_CACHE_SNAPSHOT_INVALID')
    let last=-1
    const t=clock()
    for(const e of snapshot.entries){
      let parsed
      try{parsed=JSON.parse(e.key)}catch{throw Error('YOUTUBE_CACHE_ENTRY_INVALID')}
      if(!Array.isArray(parsed)||parsed.length!==2||youtubeTmdbKey(...parsed)!==e.key
        ||entries.has(e.key)||!validTime(e.checkedAt)||e.checkedAt>t||e.checkedAt<last)
        throw Error('YOUTUBE_CACHE_ENTRY_INVALID')
      const response=safeResponse(e.key,e.response)
      if(!response||!stages(response).includes(e.ttlDays)||fingerprint(response)!==e.fingerprint)
        throw Error('YOUTUBE_CACHE_ENTRY_INVALID')
      last=e.checkedAt
      insert({key:e.key,checkedAt:e.checkedAt,ttlDays:e.ttlDays,fingerprint:e.fingerprint,response})
    }
    if(counters.evicted)throw Error('YOUTUBE_CACHE_SNAPSHOT_INVALID')
  }
  return Object.freeze({
    get(path,params){
      const entry=entries.get(youtubeTmdbKey(path,params)),t=clock()
      if(!entry||t<entry.checkedAt){counters.misses++;return null}
      if(t>=expires(entry)){counters.expired++;return null}
      counters.hits++
      return copy(entry.response)
    },
    // Call exclusively on a successful live TMDB response, never on a read
    // from this or another cache (nor on a technical error).
    recordFresh(path,params,value){
      const key=youtubeTmdbKey(path,params)
      const response=key?safeResponse(key,value):null
      const t=clock(),prior=entries.get(key)
      if(!response||(prior&&t<prior.checkedAt)){counters.rejected++;return false}
      const digest=fingerprint(response)
      const schedule=stages(response)
      let ttlDays=schedule[0]
      if(prior?.fingerprint===digest){
        // No early renewal, even if a caller forcibly repeats a live call.
        if(t<expires(prior))return true
        ttlDays=Math.min(prior.ttlDays*2,schedule.at(-1))
        counters.renewed++
      }else if(prior)counters.changed++
      insert({key,checkedAt:t,ttlDays,fingerprint:digest,response})
      counters.recorded++
      return true
    },
    snapshot(){return {kind:KIND,schemaVersion:1,entries:copy([...entries.values()].sort((a,b)=>a.checkedAt-b.checkedAt))}},
    counts(){return {...counters,entries:entries.size,bytes}},
  })
}

// Read-only bridge: a hit never writes into the TV cache or renews either TTL.
export function readSharedYoutubeTmdbResponse(shared,path,params){
  const key=sharedYoutubeSearchKey(path,params)
  if(!key||typeof shared?.get!=='function')return null
  try{return safeResponse(key,shared.get(key))}catch{return null}
}

function assertBucket(bucket){if(bucket?.name!==BUCKET)throw Error('YOUTUBE_PRIVATE_CACHE_BUCKET_REQUIRED')}
export async function loadYoutubeTmdbCache(bucket,{now=Date.now}={}){
  assertBucket(bucket)
  let meta
  try{[meta]=await bucket.file(YOUTUBE_TMDB_CACHE_OBJECT).getMetadata()}
  catch(e){if(Number(e?.code)===404)return {cache:createAdaptiveYoutubeTmdbCache({now}),generation:'0'};throw e}
  const generation=String(meta.generation),size=Number(meta.size)
  if(!/^[1-9]\d*$/.test(generation)||!Number.isSafeInteger(Number(generation))
    ||!Number.isSafeInteger(size)||size<=0||size>MAX_BYTES)throw Error('YOUTUBE_CACHE_METADATA_INVALID')
  // A generation disappearing after metadata is an error, not an empty cache.
  const [data]=await bucket.file(YOUTUBE_TMDB_CACHE_OBJECT,{generation}).download()
  if(data.length!==size)throw Error('YOUTUBE_CACHE_BYTES_MISMATCH')
  return {cache:createAdaptiveYoutubeTmdbCache({snapshot:JSON.parse(data.toString('utf8')),now}),generation}
}
export async function saveYoutubeTmdbCache(bucket,cache,{expectedGeneration,now=Date.now}={}){
  assertBucket(bucket)
  if(!/^(0|[1-9]\d*)$/.test(String(expectedGeneration))
    ||!Number.isSafeInteger(Number(expectedGeneration)))throw Error('YOUTUBE_CACHE_GENERATION_REQUIRED')
  const snapshot=createAdaptiveYoutubeTmdbCache({snapshot:cache.snapshot(),now}).snapshot()
  const data=Buffer.from(JSON.stringify(snapshot))
  if(data.length>MAX_BYTES)throw Error('YOUTUBE_CACHE_TOO_LARGE')
  await bucket.file(YOUTUBE_TMDB_CACHE_OBJECT).save(data,{resumable:false,contentType:'application/json',
    preconditionOpts:{ifGenerationMatch:Number(expectedGeneration)}})
  const current=await loadYoutubeTmdbCache(bucket,{now})
  if(hash(JSON.stringify(current.cache.snapshot()))!==hash(data))throw Error('YOUTUBE_CACHE_READBACK_FAILED')
  return current
}
