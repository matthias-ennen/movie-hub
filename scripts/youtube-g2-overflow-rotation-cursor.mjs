/**
 * Private AP2 overflow planner. Reviews beyond the stable 250-film baseline
 * require their own CAS cursor; this module DOES NOT run an API request or
 * authorize any publication. Every TMDB identity remains canonical.
 */
import {mapFromCandidateCheckpoint}
  from './youtube-g2-durable-candidate-checkpoint.mjs'
import {selectBoundedKnownMovieBaseline}
  from './youtube-g2-global-known-no-search-live.mjs'
import {selectYoutubeBadgedMovies}
  from './youtube-g2-tmdb-first-link-model.mjs'

export const OVERFLOW_CURSOR_KIND='moviehub-youtube-g2-private-overflow-review-cursor'
export const OVERFLOW_CURSOR_OBJECT='youtube-g2/private-overflow-review/v1/cursor.json'
export const OVERFLOW_MAX_REVIEW_FILMS=25
const BUCKET='movie-hub-62459-nightly-checkpoints'
const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT/.test(x)
  &&Number.isFinite(Date.parse(x))
const safeInt=x=>Number.isSafeInteger(x)&&x>=0
const date=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)
  &&Number.isFinite(Date.parse(x+'T00:00:00Z'))
const clone=x=>JSON.parse(JSON.stringify(x))
const CURSOR_FIELDS=[
  'kind','schemaVersion','privateOnly','publicationPermitted',
  'verifiedDEOffers','searchCalls','productionWrites','updatedAt',
  'lastTmdbId','completedBatches','reviewedFilms','lastReviewedUtcDate',
]
export function validateOverflowCursor(doc){
  if(!doc||typeof doc!=='object'||Array.isArray(doc)
    ||Object.keys(doc).length!==CURSOR_FIELDS.length
    ||Object.keys(doc).some(k=>!CURSOR_FIELDS.includes(k))
    ||doc.kind!==OVERFLOW_CURSOR_KIND||doc.schemaVersion!==1
    ||doc.privateOnly!==true||doc.publicationPermitted!==false
    ||doc.verifiedDEOffers!==0||doc.searchCalls!==0
    ||doc.productionWrites!==0||!iso(doc.updatedAt)
    ||!safeInt(doc.lastTmdbId)||!safeInt(doc.completedBatches)
    ||!safeInt(doc.reviewedFilms)
    ||(doc.completedBatches===0)!==(doc.lastReviewedUtcDate===null)
    ||(doc.lastReviewedUtcDate!==null&&(!date(doc.lastReviewedUtcDate)
      ||doc.lastReviewedUtcDate>doc.updatedAt.slice(0,10))))
    throw Error('G2_OVERFLOW_CURSOR_INVALID')
  return clone(doc)
}
export function initialOverflowCursor(now=new Date().toISOString()){
  if(!iso(now))throw Error('G2_OVERFLOW_CLOCK_INVALID')
  return validateOverflowCursor({
    kind:OVERFLOW_CURSOR_KIND,schemaVersion:1,privateOnly:true,
    publicationPermitted:false,verifiedDEOffers:0,
    searchCalls:0,productionWrites:0,updatedAt:now,
    lastTmdbId:0,completedBatches:0,reviewedFilms:0,
    lastReviewedUtcDate:null,
  })
}
function findCrossTitleCollisions(all){
  const owners=new Map(),conflicts=new Set()
  for(const [tmdbId,videoIds] of all)for(const id of videoIds){
    const owner=owners.get(id)
    if(owner!==undefined&&owner!==tmdbId){
      conflicts.add(owner);conflicts.add(tmdbId)
    }else owners.set(id,tmdbId)
  }
  return conflicts
}
const hasBadge=e=>Array.isArray(e?.providerIds)
    &&e.providerIds.includes('youtube')
  ||Array.isArray(e?.providerOffers)
    &&e.providerOffers.some(p=>p?.id==='youtube')

/** Pure, bounded, deterministic plan; no API/Cloud side effects. */
export function planOverflowRotation({
  checkpoint,publicIndex,cursor=null,
  now=new Date().toISOString(),limit=OVERFLOW_MAX_REVIEW_FILMS,
}={}){
  if(!iso(now)||!Number.isInteger(limit)||limit<1
    ||limit>OVERFLOW_MAX_REVIEW_FILMS)
    throw Error('G2_OVERFLOW_SELECTION_INVALID')
  const progress=cursor?validateOverflowCursor(cursor):initialOverflowCursor(now)
  if(Date.parse(now)<Date.parse(progress.updatedAt))
    throw Error('G2_OVERFLOW_CLOCK_REGRESSION')
  const published=Date.parse(publicIndex?.generatedAt)
  if(!Number.isFinite(published)
    ||Date.parse(now)-published< -86400000
    ||Date.parse(now)-published>30*86400000)
    throw Error('G2_OVERFLOW_PUBLIC_INDEX_STALE')
  // Reuse the same published DE index contract as the baseline.
  selectYoutubeBadgedMovies(publicIndex,{limit:1})
  const all=mapFromCandidateCheckpoint(checkpoint)
  const baseline=selectBoundedKnownMovieBaseline(checkpoint)
  const conflicts=findCrossTitleCollisions(all)
  const badges=new Set(publicIndex.entries
    .filter(e=>e?.type==='movie'&&Number.isSafeInteger(e.tmdbId)
      &&e.tmdbId>0&&hasBadge(e)).map(e=>e.tmdbId))
  const remainder=[...all.keys()].filter(id=>!baseline.mapping.has(id)
    &&!conflicts.has(id)).sort((a,b)=>a-b)
  const eligible=remainder.filter(id=>badges.has(id))
  const sameUtcDay=progress.lastReviewedUtcDate===now.slice(0,10)
  const higher=eligible.filter(id=>id>progress.lastTmdbId)
  const wrapped=eligible.length>0&&higher.length===0
  const selectedIds=sameUtcDay?[]:(wrapped?eligible:higher).slice(0,limit)
  return {
    kind:'moviehub-youtube-g2-overflow-private-review-plan',
    generatedAt:now,checkpointFilms:all.size,
    baselineFilms:baseline.mapping.size,
    collisionQuarantineFilms:conflicts.size,
    deferredFilms:all.size-baseline.mapping.size,
    eligibleOverflowFilms:eligible.length,
    missingPublicBadgeFilms:remainder.length-eligible.length,
    selectedIds,startedAfterTmdbId:progress.lastTmdbId,
    wrapped:!sameUtcDay&&wrapped,alreadyReviewedToday:sameUtcDay,
    searchCalls:0,verifiedDEOffers:0,publicationPermitted:false,
    productionWrites:0,
  }
}
export function advanceOverflowCursor(cursor,plan,{
  now=plan?.generatedAt,
}={}){
  const old=cursor?validateOverflowCursor(cursor):initialOverflowCursor(now)
  const ids=plan?.selectedIds
  if(!iso(now)||Date.parse(now)<Date.parse(old.updatedAt)
    ||plan?.kind!=='moviehub-youtube-g2-overflow-private-review-plan'
    ||plan?.generatedAt!==now
    ||plan?.startedAfterTmdbId!==old.lastTmdbId
    ||plan?.publicationPermitted!==false||plan.searchCalls!==0
    ||plan.verifiedDEOffers!==0||plan.productionWrites!==0
    ||plan.alreadyReviewedToday!==false
    ||!Array.isArray(ids)||ids.length<1
    ||ids.length>OVERFLOW_MAX_REVIEW_FILMS
    ||ids.length>plan.eligibleOverflowFilms
    ||new Set(ids).size!==ids.length
    ||ids.some((id,i)=>!Number.isSafeInteger(id)||id<1
      ||i>0&&ids[i-1]>=id)
    ||(plan.wrapped===true&&old.lastTmdbId===0)
    ||(plan.wrapped!==true&&ids[0]<=old.lastTmdbId)
    ||old.lastReviewedUtcDate===now.slice(0,10))
    throw Error('G2_OVERFLOW_ADVANCE_NOT_AUTHORIZED')
  return validateOverflowCursor({
    ...old,updatedAt:now,lastTmdbId:ids[ids.length-1],
    completedBatches:old.completedBatches+1,
    reviewedFilms:old.reviewedFilms+ids.length,
    lastReviewedUtcDate:now.slice(0,10),
  })
}
function assertBucket(bucket){
  if(bucket?.name!==BUCKET||typeof bucket.file!=='function')
    throw Error('G2_OVERFLOW_BUCKET_INVALID')
}
function validGeneration(value){
  return /^\d+$/.test(String(value))
    &&Number.isSafeInteger(Number(value))
}
export async function loadOverflowCursor(bucket){
  assertBucket(bucket)
  const file=bucket.file(OVERFLOW_CURSOR_OBJECT)
  let meta
  try{[meta]=await file.getMetadata()}
  catch(e){
    if(Number(e?.code)===404)return {cursor:null,generation:'0'}
    throw e
  }
  const generation=String(meta.generation)
  if(!validGeneration(generation))
    throw Error('G2_OVERFLOW_GENERATION_INVALID')
  const [bytes]=await bucket.file(OVERFLOW_CURSOR_OBJECT,{generation}).download()
  if(!Buffer.isBuffer(bytes)||bytes.length>2048)
    throw Error('G2_OVERFLOW_BYTES_INVALID')
  return {cursor:validateOverflowCursor(JSON.parse(bytes.toString('utf8'))),
    generation}
}
export async function saveOverflowCursor(bucket,cursor,{expectedGeneration}={}){
  assertBucket(bucket)
  const checked=validateOverflowCursor(cursor)
  if(!validGeneration(expectedGeneration))
    throw Error('G2_OVERFLOW_CAS_REQUIRED')
  const bytes=Buffer.from(JSON.stringify(checked)+'\n')
  if(bytes.length>2048)throw Error('G2_OVERFLOW_BYTES_INVALID')
  await bucket.file(OVERFLOW_CURSOR_OBJECT).save(bytes,{
    resumable:false,contentType:'application/json',
    preconditionOpts:{ifGenerationMatch:Number(expectedGeneration)},
  })
  const readback=await loadOverflowCursor(bucket)
  if(JSON.stringify(readback.cursor)!==JSON.stringify(checked))
    throw Error('G2_OVERFLOW_CAS_READBACK_MISMATCH')
  return readback
}
