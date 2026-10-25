/**
 * Persistent, fail-closed progress for already SUCCESSFUL YouTube research QA.
 * An attempted, cancelled, partial, 429 or unverified Actions run must NEVER
 * advance the discovery cursor. A changed public badge queue stops continuation.
 *
 * This is an uninvoked library: NO YouTube/Google APIs, no scheduler, no
 * production writes, no offer or playback approval.
 */
import {createHash} from 'node:crypto'
import {YOUTUBE_FULL_CATALOG_PLAN}
  from './youtube-g2-full-catalog-queue.mjs'
export const PROGRESS_KIND='moviehub-youtube-g2-private-bootstrap-progress'
export const PROGRESS_OBJECT='youtube-g2/private-bootstrap/v1/progress.json'
export const PROGRESS_BUCKET='movie-hub-62459-nightly-checkpoints'
const sha=v=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v)
const run=v=>Number.isSafeInteger(v)&&v>0
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const clone=v=>JSON.parse(JSON.stringify(v))
export function validateProgress(state){
  if(state?.kind!==PROGRESS_KIND||state.schemaVersion!==1
    ||state.projectId!=='movie-hub-62459'
    ||!Number.isSafeInteger(state.total)||state.total<1||state.total>100000
    ||typeof state.queueIdentity!=='string'
    ||!/^[a-f0-9]{64}$/.test(state.queueIdentity)
    ||!Number.isSafeInteger(state.nextOffset)||state.nextOffset<0
    ||state.nextOffset>state.total
    ||state.completed!==(state.nextOffset===state.total)
    ||state.verifiedGermanOffers!==0||state.publishedRoutes!==0
    ||state.providerWrites!==0||state.firestoreWrites!==0
    ||state.productionWrites!==0||state.autoSearchEnabled!==false
    ||!Array.isArray(state.batches)||state.batches.length>10000
    ||!Number.isFinite(Date.parse(state.updatedAt)))
    throw Error('YOUTUBE_BOOTSTRAP_PROGRESS_UNTRUSTED')
  let cursor=0
  const ids=new Set()
  for(const b of state.batches){
    if(!run(b?.runId)||ids.has(b.runId)||!sha(b.sourceSha)
      ||b.offset!==cursor||!Number.isInteger(b.selectedCount)
      ||b.selectedCount<1||b.selectedCount>25
      ||!Number.isInteger(b.actualSearches)||b.actualSearches<0
      ||!Number.isInteger(b.plannedSearches)||b.plannedSearches<0
      ||b.plannedSearches>50||b.actualSearches>b.plannedSearches
      ||!Number.isFinite(Date.parse(b.finishedAt))
      ||b.status!=='success-complete-QA-candidate-only')
      throw Error('YOUTUBE_BOOTSTRAP_PROGRESS_BATCH_UNTRUSTED')
    ids.add(b.runId)
    cursor+=b.selectedCount
    if(cursor>state.total)throw Error('YOUTUBE_BOOTSTRAP_PROGRESS_OVERRUN')
  }
  if(cursor!==state.nextOffset
    ||digest(state.batches.map(b=>[b.runId,b.offset,b.selectedCount]))!==state.checksum)
    throw Error('YOUTUBE_BOOTSTRAP_PROGRESS_CHECKSUM_OR_CURSOR_INVALID')
  return clone(state)
}
const newState=(plan,now)=>({
  kind:PROGRESS_KIND,schemaVersion:1,projectId:'movie-hub-62459',
  total:plan.batch.total,queueIdentity:plan.batch.queueIdentity,
  nextOffset:0,completed:false,
  updatedAt:now,batches:[],
  checksum:digest([]),
  verifiedGermanOffers:0,publishedRoutes:0,providerWrites:0,
  firestoreWrites:0,productionWrites:0,autoSearchEnabled:false,
})
const validRow=(row)=>row&&typeof row==='object'
  &&Number.isSafeInteger(row.tmdbId)&&row.tmdbId>0
  &&row.publicationPermitted===false
  &&(row.directPlaybackRoute===null||row.directPlaybackRoute===undefined)
  &&!row.verifiedDePlayback
export function advanceCompletedBootstrapQa({
  current=null,qa,workflow,
  now=new Date().toISOString(),
}={}){
  // Important: ONLY the caller authenticates this workflow via GitHub's API,
  // including main SHA, successful completed attempt, artifact ID and checksum.
  if(!run(workflow?.runId)||!sha(workflow?.sourceSha)
    ||workflow?.verifiedCompletedSuccess!==true
    ||workflow?.verifiedMainBranch!==true
    ||workflow?.verifiedPrivateArtifact!==true
    ||!Number.isFinite(Date.parse(now)))
    throw Error('YOUTUBE_BOOTSTRAP_COMPLETED_ACTIONS_PROVENANCE_REQUIRED')
  const p=qa?.plan,s=qa?.pilot?.summary,rows=qa?.pilot?.rows
  if(p?.mode!==YOUTUBE_FULL_CATALOG_PLAN||p.publicationPermitted!==false
    ||p.verifiedDEOffers!==0||p.confirmedDirectLinks!==0
    ||p.catalogWrites!==0||p.firestoreWrites!==0||p.providerWrites!==0
    ||p.badgeWrites!==0||p.nightlyWrites!==0
    ||!Number.isInteger(p.batch?.offset)||p.batch.offset<0
    ||!Number.isInteger(p.batch?.total)||p.batch.total<1
    ||!Number.isInteger(p.batch?.selectedCount)
    ||p.batch.selectedCount<1||p.batch.selectedCount>25
    ||p.batch.offset+p.batch.selectedCount>p.batch.total
    ||p.batch.nextOffset!==(
      p.batch.offset+p.batch.selectedCount===p.batch.total
        ?null:p.batch.offset+p.batch.selectedCount)
    ||!/^[a-f0-9]{64}$/.test(p.batch.queueIdentity||'')
    ||!Array.isArray(p.plan)||p.plan.length!==p.batch.selectedCount
    ||p.plan.some(x=>x?.key!=='movie:'+x?.tmdbId
      ||!Number.isSafeInteger(x?.tmdbId)||x.tmdbId<1
      ||x.confirmedVideoId!==null||x.playbackRoute!==null
      ||x.publicationPermitted!==false)
    ||new Set(p.plan.map(x=>x.tmdbId)).size!==p.plan.length
    ||!Array.isArray(rows)||rows.length!==p.batch.selectedCount
    ||rows.some(x=>!validRow(x)
      ||!p.plan.some(y=>y.tmdbId===x.tmdbId))
    ||new Set(rows.map(x=>x.tmdbId)).size!==rows.length
    ||s?.publicationPermitted!==false||s.verifiedDirectLinks!==0
    ||s.catalogWrites!==0||s.firestoreWrites!==0||s.providerWrites!==0
    ||s.badgeWrites!==0||s.nightlyWrites!==0
    ||s.processedMovies!==p.batch.selectedCount
    ||!Number.isInteger(s.calls?.youtubeSearches)
    ||s.calls.youtubeSearches<0
    ||!Number.isInteger(p.batch.youtubeSearchCallsPlanned)
    ||s.calls.youtubeSearches>p.batch.youtubeSearchCallsPlanned
    ||p.batch.youtubeSearchCallsPlanned>50
    ||!s.statusCounts||typeof s.statusCounts!=='object'
    ||Object.values(s.statusCounts).reduce((a,b)=>a+b,0)!==rows.length)
    throw Error('YOUTUBE_BOOTSTRAP_QA_NOT_FULLY_COMPLETED')
  const state=current===null?newState(p,now):validateProgress(current)
  if(p.batch.total!==state.total
    ||p.batch.queueIdentity!==state.queueIdentity)
    throw Error('YOUTUBE_BOOTSTRAP_PUBLIC_QUEUE_CHANGED_STOP_AND_REBASE')
  if(p.batch.offset!==state.nextOffset)
    throw Error('YOUTUBE_BOOTSTRAP_OFFSET_NOT_CONTIGUOUS')
  if(state.batches.some(x=>x.runId===workflow.runId))
    throw Error('YOUTUBE_BOOTSTRAP_ACTIONS_RUN_ALREADY_CONSUMED')
  const nextBatches=[...state.batches,{
    runId:workflow.runId,sourceSha:workflow.sourceSha,
    offset:p.batch.offset,selectedCount:p.batch.selectedCount,
    actualSearches:s.calls.youtubeSearches,
    plannedSearches:p.batch.youtubeSearchCallsPlanned,
    finishedAt:new Date(now).toISOString(),
    status:'success-complete-QA-candidate-only',
  }]
  const next=validateProgress({
    ...state,batches:nextBatches,
    nextOffset:p.batch.offset+p.batch.selectedCount,
    completed:p.batch.offset+p.batch.selectedCount===p.batch.total,
    updatedAt:new Date(now).toISOString(),
    checksum:digest(nextBatches.map(b=>[b.runId,b.offset,b.selectedCount])),
  })
  return {
    progress:next,queueIdentity:next.queueIdentity,
    nextOffset:next.completed?null:next.nextOffset,
    // "progress" is not an approved offer, valid DE link or user playback.
    independentlyVerifiedDeOffers:0,publishedDirectRoutes:0,
    automaticNextBatchAllowed:false,
    extraYouTubeApiRequests:0,
  }
}
export async function loadBootstrapProgress(bucket){
  if(bucket?.name!==PROGRESS_BUCKET||typeof bucket.file!=='function')
    throw Error('YOUTUBE_BOOTSTRAP_PRIVATE_BUCKET_REQUIRED')
  const file=bucket.file(PROGRESS_OBJECT)
  let metadata
  try{[metadata]=await file.getMetadata()}
  catch(e){if(Number(e?.code)===404)return {progress:null,generation:'0'};throw e}
  const generation=String(metadata.generation)
  if(!/^\d+$/.test(generation)||!Number.isSafeInteger(Number(generation)))
    throw Error('YOUTUBE_BOOTSTRAP_GENERATION_INVALID')
  const [bytes]=await bucket.file(PROGRESS_OBJECT,{generation}).download()
  if(!Buffer.isBuffer(bytes)||bytes.length>128000)
    throw Error('YOUTUBE_BOOTSTRAP_STATE_TOO_LARGE')
  return {progress:validateProgress(JSON.parse(bytes.toString('utf8'))),generation}
}
export async function persistCompletedBootstrapQa(bucket,{
  qa,workflow,now,
}={}){
  const old=await loadBootstrapProgress(bucket)
  const result=advanceCompletedBootstrapQa({
    current:old.progress,qa,workflow,now,
  })
  const bytes=Buffer.from(JSON.stringify(result.progress)+'\n')
  if(bytes.length>128000)throw Error('YOUTUBE_BOOTSTRAP_PROGRESS_BYTES_OVERFLOW')
  // Deliberately no retry on GCS 412: a competing completion won the CAS.
  await bucket.file(PROGRESS_OBJECT).save(bytes,{
    resumable:false,contentType:'application/json',
    preconditionOpts:{ifGenerationMatch:Number(old.generation)},
  })
  const after=await loadBootstrapProgress(bucket)
  if(after.progress.checksum!==result.progress.checksum)
    throw Error('YOUTUBE_BOOTSTRAP_CURSOR_READBACK_MISMATCH')
  return {
    nextOffset:result.nextOffset,completed:result.progress.completed,
    consumedRuns:after.progress.batches.length,
    // not a Google search token / quota admission / automatic runner trigger
    quotaReservationAcquired:false,autoSearchEnabled:false,
    youtubeCallsPerformed:0,productionWrites:0,
  }
}
