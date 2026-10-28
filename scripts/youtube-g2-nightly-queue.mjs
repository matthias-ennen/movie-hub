/**
 * Private, resumable, read-only YouTube movie discovery progress.
 * Records public TMDB movie IDs and statuses only. Never store VIDEO IDs,
 * personal titles or account metadata in this queue. Existing known VIDEO
 * candidates remain in the separately checksummed private GCS checkpoint.
 *
 * A queued film marked "started" after CAS is not retried for two days if
 * the runner dies. A completed no-offer/no-video case can be rechecked after
 * 30 days. Known successful candidates use the daily zero-search refresh.
 */
import {mapFromCandidateCheckpoint} from './youtube-g2-durable-candidate-checkpoint.mjs'

export const NIGHTLY_QUEUE_KIND='moviehub-youtube-g2-nightly-public-badge-queue'
export const NIGHTLY_QUEUE_OBJECT='youtube-g2/private-nightly-research/v1/queue.json'
export const NIGHTLY_MAX_TRACKED=3500
// Future preflight planning only; the live nightly runner still requests 60.
export const NIGHTLY_MAX_PREFLIGHT_PLAN_MOVIES=600
const STAGES=new Set(['started','known-candidate','no-current-offer','no-video-candidates'])
const allowed=x=>Number.isSafeInteger(x)&&x>0
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))
const copy=x=>JSON.parse(JSON.stringify(x))

export function validateNightlyQueue(doc){
  if(doc?.kind!==NIGHTLY_QUEUE_KIND||doc.schemaVersion!==1
    ||doc.privateOnly!==true||doc.verifiedDEOffers!==0
    ||doc.automaticOfferApprovals!==0||doc.productionWrites!==0
    ||!Array.isArray(doc.entries)||doc.entries.length>NIGHTLY_MAX_TRACKED
    ||!iso(doc.updatedAt))
    throw Error('G2_NIGHTLY_PROGRESS_INVALID')
  const seen=new Set()
  for(const e of doc.entries){
    if(!allowed(e?.tmdbId)||seen.has(e.tmdbId)
      ||!STAGES.has(e.state)||!iso(e.updatedAt)
      ||!allowed(e.runId)||Date.parse(e.updatedAt)>Date.parse(doc.updatedAt))
      throw Error('G2_NIGHTLY_ENTRY_INVALID')
    seen.add(e.tmdbId)
  }
  if(doc.entries.some((e,i)=>i>0&&doc.entries[i-1].tmdbId>=e.tmdbId))
    throw Error('G2_NIGHTLY_PROGRESS_ORDER_INVALID')
  return copy(doc)
}
export function initialNightlyQueue(now){
  if(!iso(now))throw Error('G2_NIGHTLY_TIME_INVALID')
  return validateNightlyQueue({
    kind:NIGHTLY_QUEUE_KIND,schemaVersion:1,privateOnly:true,
    verifiedDEOffers:0,automaticOfferApprovals:0,productionWrites:0,
    updatedAt:now,entries:[],
  })
}
export function putNightlyResult(progress,{
  tmdbId,state,runId,now=new Date().toISOString(),
}={}){
  const old=progress?validateNightlyQueue(progress):initialNightlyQueue(now)
  if(!allowed(tmdbId)||!STAGES.has(state)||!allowed(runId)
    ||!iso(now)||Date.parse(now)<Date.parse(old.updatedAt))
    throw Error('G2_NIGHTLY_PROGRESS_UPDATE_INVALID')
  const previous=old.entries.find(e=>e.tmdbId===tmdbId)
  if(previous?.runId===runId&&previous.state!=='started'
    &&state==='started')throw Error('G2_NIGHTLY_FINISHED_MOVIE_CANNOT_RESTART')
  if(previous?.runId===runId&&previous.state==='started'
    &&state==='started')throw Error('G2_NIGHTLY_SAME_RUN_ALREADY_STARTED')
  return validateNightlyQueue({
    ...old,updatedAt:now,
    entries:[
      ...old.entries.filter(e=>e.tmdbId!==tmdbId),
      {tmdbId,state,runId,updatedAt:now},
    ].sort((a,b)=>a.tmdbId-b.tmdbId),
  })
}
export function selectNightlyPublicBadgeMovies({
  publicIndex,checkpoint,progress=null,now=new Date().toISOString(),
  limit=120,
}={}){
  if(!Number.isInteger(limit)||limit<1||limit>NIGHTLY_MAX_PREFLIGHT_PLAN_MOVIES
    ||!iso(now)||!Number.isFinite(Date.parse(publicIndex?.generatedAt))
    ||Date.parse(now)-Date.parse(publicIndex.generatedAt)<-3600000
    ||Date.parse(now)-Date.parse(publicIndex.generatedAt)>3*86400000
    ||publicIndex.kind!=='search-index'||publicIndex.version!==1
    ||publicIndex.country!=='DE'||publicIndex.source!=='tmdb'
    ||!Array.isArray(publicIndex.entries)
    ||publicIndex.entries.length!==publicIndex.count)
    throw Error('G2_NIGHTLY_PUBLIC_INDEX_NOT_TRUSTED')
  const known=mapFromCandidateCheckpoint(checkpoint)
  const previous=progress?validateNightlyQueue(progress):initialNightlyQueue(now)
  const statuses=new Map(previous.entries.map(e=>[e.tmdbId,e]))
  const movieIds=new Set()
  for(const e of publicIndex.entries){
    const badge=Array.isArray(e?.providerIds)&&e.providerIds.includes('youtube')
      ||Array.isArray(e?.providerOffers)&&e.providerOffers.some(p=>p?.id==='youtube')
    if(e?.type==='movie'&&allowed(e.tmdbId)&&badge)movieIds.add(e.tmdbId)
  }
  const available=[]
  let blockedByCheckpoint=0,blockedByFreshProgress=0
  for(const tmdbId of [...movieIds].sort((a,b)=>a-b)){
    if(known.has(tmdbId)){blockedByCheckpoint++;continue}
    const previousRow=statuses.get(tmdbId)
    if(previousRow){
      const age=Date.parse(now)-Date.parse(previousRow.updatedAt)
      const delay=previousRow.state==='started'?2*86400000:
        previousRow.state==='known-candidate'?365*86400000:30*86400000
      if(age<delay){blockedByFreshProgress++;continue}
    }
    available.push({tmdbId,revisit:Boolean(previousRow)})
  }
  // Prioritize genuinely new work ahead of cooled-down rechecks, while the
  // nightly cursor spans the full set instead of restarting from film #1.
  available.sort((a,b)=>Number(a.revisit)-Number(b.revisit)
    ||a.tmdbId-b.tmdbId)
  return {
    movieIds:available.slice(0,limit).map(x=>x.tmdbId),
    totalPublicBadgeMovies:movieIds.size,knownCandidateMovies:blockedByCheckpoint,
    recentProgressMovies:blockedByFreshProgress,
    pendingMovies:available.length,queueTruncated:available.length>limit,
    publicationPermitted:false,verifiedDEOffers:0,
  }
}
export async function loadNightlyQueue(bucket){
  if(bucket?.name!=='movie-hub-62459-nightly-checkpoints'
    ||typeof bucket.file!=='function')throw Error('G2_NIGHTLY_BUCKET_INVALID')
  const f=bucket.file(NIGHTLY_QUEUE_OBJECT)
  let meta
  try{[meta]=await f.getMetadata()}
  catch(e){
    if(Number(e?.code)===404)return {queue:null,generation:'0'}
    throw e
  }
  const generation=String(meta.generation)
  if(!/^\d+$/.test(generation)||!Number.isSafeInteger(Number(generation)))
    throw Error('G2_NIGHTLY_GCS_GENERATION_INVALID')
  const [bytes]=await bucket.file(NIGHTLY_QUEUE_OBJECT,{generation}).download()
  if(!Buffer.isBuffer(bytes)||bytes.length>600000)
    throw Error('G2_NIGHTLY_GCS_BYTES_INVALID')
  return {queue:validateNightlyQueue(JSON.parse(bytes.toString('utf8'))),generation}
}
export async function saveNightlyQueue(bucket,doc,{expectedGeneration}={}){
  const queue=validateNightlyQueue(doc)
  if(!/^\d+$/.test(String(expectedGeneration))
    ||!Number.isSafeInteger(Number(expectedGeneration)))
    throw Error('G2_NIGHTLY_GCS_CAS_REQUIRED')
  const bytes=Buffer.from(JSON.stringify(queue)+'\n')
  if(bytes.length>600000)throw Error('G2_NIGHTLY_GCS_TOO_LARGE')
  await bucket.file(NIGHTLY_QUEUE_OBJECT).save(bytes,{
    resumable:false,contentType:'application/json',
    preconditionOpts:{ifGenerationMatch:Number(expectedGeneration)},
  })
  const readback=await loadNightlyQueue(bucket)
  if(JSON.stringify(readback.queue)!==JSON.stringify(queue))
    throw Error('G2_NIGHTLY_GCS_READBACK_MISMATCH')
  return readback
}
