/**
 * Private durable GCS checkpoint for REVIEW-ONLY TMDB-first YouTube candidate
 * VIDEO IDs. This is NOT an offer, verified film/cut, playback right or
 * canonical source envelope. Never publish this payload on Firebase Hosting.
 *
 * Uses the existing private nightly-checkpoint bucket and OIDC identity.
 * A content-addressed immutable object + conditional latest-pointer write
 * protects against partial writes and concurrent checkpoint overwrites.
 */
import {createHash,randomUUID} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {getTrustedTmdbFirstKnownCandidates,validateKnownCandidateMap}
  from './youtube-g2-known-candidate-reuse.mjs'

export const CANDIDATE_CHECKPOINT_KIND='moviehub-youtube-g2-known-video-candidates'
export const CANDIDATE_CHECKPOINT_VERSION=1
export const CANDIDATE_CHECKPOINT_PREFIX='youtube-g2/private-known-candidates/v1'
export const CANDIDATE_CHECKPOINT_LATEST=CANDIDATE_CHECKPOINT_PREFIX+'/latest.json'
export const CANDIDATE_CHECKPOINT_MAX_MOVIES=3500
export const CANDIDATE_CHECKPOINT_MAX_BYTES=2_000_000
const VIDEO=/^[A-Za-z0-9_-]{11}$/
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex')
const validTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))
const safeString=x=>typeof x==='string'&&x.length>0
const copy=x=>JSON.parse(JSON.stringify(x))
function canonical(entries){
  return [...entries].sort((a,b)=>a.tmdbId-b.tmdbId)
}
export function createCandidateCheckpointFromArchive(archive,{
  now=new Date().toISOString(),
}={}){
  const known=getTrustedTmdbFirstKnownCandidates(archive)
  if(!validTime(now)||!known.size)throw Error('G2_CANDIDATE_BOOTSTRAP_INVALID')
  const entries=canonical([...known].map(([tmdbId,videoIds])=>({
    tmdbId,videoIds:[...videoIds],
    provenance:[{kind:'original-trusted-25-film-archive',runId:40086393094}],
  })))
  return validateCandidateCheckpoint({
    kind:CANDIDATE_CHECKPOINT_KIND,schemaVersion:CANDIDATE_CHECKPOINT_VERSION,
    createdAt:now,updatedAt:now,
    evidenceStatus:'candidate-only-not-independent-DE-offer',
    verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
    entries,
  })
}
export function validateCandidateCheckpoint(doc){
  if(doc?.kind!==CANDIDATE_CHECKPOINT_KIND
    ||doc?.schemaVersion!==CANDIDATE_CHECKPOINT_VERSION
    ||!validTime(doc.createdAt)||!validTime(doc.updatedAt)
    ||Date.parse(doc.updatedAt)<Date.parse(doc.createdAt)
    ||doc.evidenceStatus!=='candidate-only-not-independent-DE-offer'
    ||doc.verifiedDEOffers!==0||doc.approvedDirectRoutes!==0
    ||doc.productionWrites!==0
    ||!Array.isArray(doc.entries)
    ||doc.entries.length<1||doc.entries.length>CANDIDATE_CHECKPOINT_MAX_MOVIES)
    throw Error('G2_CANDIDATE_CHECKPOINT_INVALID')
  const keys=new Set()
  for(const entry of doc.entries){
    if(!Number.isInteger(entry?.tmdbId)||entry.tmdbId<1||keys.has(entry.tmdbId)
      ||!Array.isArray(entry?.videoIds)||entry.videoIds.length<1
      ||entry.videoIds.length>10
      ||new Set(entry.videoIds).size!==entry.videoIds.length
      ||entry.videoIds.some(id=>typeof id!=='string'||!VIDEO.test(id))
      ||!Array.isArray(entry.provenance)||entry.provenance.length<1
      ||entry.provenance.length>5
      ||entry.provenance.some(p=>
        !['original-trusted-25-film-archive','successful-readonly-full-catalog-batch'].includes(p?.kind)
        ||!Number.isSafeInteger(p?.runId)||p.runId<1)){
      throw Error('G2_CANDIDATE_CHECKPOINT_ENTRY_INVALID')
    }
    keys.add(entry.tmdbId)
  }
  if(doc.entries.some((e,i)=>i>0&&doc.entries[i-1].tmdbId>=e.tmdbId))
    throw Error('G2_CANDIDATE_CHECKPOINT_ORDER_INVALID')
  if(Buffer.byteLength(JSON.stringify(doc))>CANDIDATE_CHECKPOINT_MAX_BYTES)
    throw Error('G2_CANDIDATE_CHECKPOINT_TOO_LARGE')
  return copy(doc)
}
export function mapFromCandidateCheckpoint(doc){
  const accepted=validateCandidateCheckpoint(doc)
  const map=new Map(accepted.entries.map(x=>[x.tmdbId,x.videoIds]))
  return validateKnownCandidateMap(map)
}
/** Ingest ONLY a successful, read-only research QA from our own batch;
 * never store raw personal inventory or a direct player link.
 */
export function mergeCandidateCheckpoint(previous,qa,{
  runId,now=new Date().toISOString(),
}={}){
  const old=validateCandidateCheckpoint(previous)
  if(!Number.isSafeInteger(runId)||runId<1||!validTime(now))
    throw Error('G2_CANDIDATE_MERGE_SOURCE_INVALID')
  const p=qa?.plan,b=qa?.pilot?.summary,rows=qa?.pilot?.rows
  if(p?.publicationPermitted!==false||p?.verifiedDEOffers!==0
    ||p?.confirmedDirectLinks!==0
    ||!Array.isArray(p?.plan)||!Number.isInteger(p.batch?.selectedCount)
    ||p.batch.selectedCount!==p.plan.length
    ||b?.publicationPermitted!==false||b?.verifiedDirectLinks!==0
    ||b?.processedMovies!==p.plan.length
    ||!Array.isArray(rows)||rows.length!==p.plan.length
    ||['catalogWrites','firestoreWrites','providerWrites','badgeWrites','nightlyWrites']
      .some(key=>p[key]!==0||b[key]!==0)
    ||rows.some((r,i)=>r?.tmdbId!==p.plan[i]?.tmdbId
      ||r.publicationPermitted!==false||r.reviewedVideoId!==null
      ||r.directPlaybackRoute!==null
      ||!Array.isArray(r.videoCandidates)||r.videoCandidates.length>10
      ||r.videoCandidates.some(c=>!VIDEO.test(c?.videoId)))
    ||new Set(rows.map(r=>r.tmdbId)).size!==rows.length)
    throw Error('G2_CANDIDATE_BATCH_QA_NOT_TRUSTED')
  const byId=new Map(old.entries.map(x=>[x.tmdbId,copy(x)]))
  let newMovies=0,newIds=0
  for(const row of rows){
    if(!row.videoCandidates.length)continue
    const fresh=[...new Set(row.videoCandidates.map(x=>x.videoId))]
    const prior=byId.get(row.tmdbId)
    if(!prior){
      byId.set(row.tmdbId,{tmdbId:row.tmdbId,videoIds:fresh,
        provenance:[{kind:'successful-readonly-full-catalog-batch',runId}]})
      newMovies++
      newIds+=fresh.length
    }else{
      const seen=new Set(prior.videoIds)
      for(const id of fresh)if(!seen.has(id)&&prior.videoIds.length<10){
        prior.videoIds.push(id);seen.add(id);newIds++
      }
      // Do not mistake processing this film again for renewed offer proof.
      if(!prior.provenance.some(p=>p.runId===runId))
        prior.provenance=[...prior.provenance,
          {kind:'successful-readonly-full-catalog-batch',runId}].slice(-5)
    }
  }
  const updated=validateCandidateCheckpoint({
    ...old,updatedAt:now,entries:canonical(byId.values()),
  })
  return {checkpoint:updated,newMovies,newIds,sourceRun:runId,
    existingMovies:old.entries.length,movies:updated.entries.length}
}
export function serializeCheckpoint(doc){
  const validated=validateCandidateCheckpoint(doc)
  const bytes=Buffer.from(JSON.stringify(validated)+'\n','utf8')
  if(bytes.length>CANDIDATE_CHECKPOINT_MAX_BYTES)
    throw Error('G2_CANDIDATE_CHECKPOINT_TOO_LARGE')
  return {bytes,hash:sha256(bytes)}
}
function validPointer(p){
  return p?.kind==='youtube-g2-private-candidate-pointer'
    &&p?.schemaVersion===1
    &&typeof p.sha256==='string'&&/^[0-9a-f]{64}$/.test(p.sha256)
    &&typeof p.object==='string'
    &&p.object.startsWith(CANDIDATE_CHECKPOINT_PREFIX+'/snapshots/')
    &&/^[-a-f0-9]{36}\.json$/.test(
      p.object.slice((CANDIDATE_CHECKPOINT_PREFIX+'/snapshots/').length))
    &&Number.isInteger(p.bytes)&&p.bytes>0
    &&p.bytes<=CANDIDATE_CHECKPOINT_MAX_BYTES
}
async function readPointer(bucket){
  const obj=bucket.file(CANDIDATE_CHECKPOINT_LATEST)
  try{
    const [meta]=await obj.getMetadata()
    const generation=String(meta.generation)
    const [bytes]=await bucket.file(CANDIDATE_CHECKPOINT_LATEST,
      {generation}).download()
    const value=JSON.parse(bytes.toString('utf8'))
    if(!validPointer(value))throw Error('G2_CANDIDATE_POINTER_INVALID')
    return {pointer:value,generation}
  }catch(error){
    if(Number(error?.code)===404)return {pointer:null,generation:'0'}
    throw error
  }
}
export async function loadDurableCandidateCheckpoint(bucket){
  const {pointer,generation}=await readPointer(bucket)
  if(!pointer)return {checkpoint:null,generation}
  const [bytes]=await bucket.file(pointer.object).download()
  if(bytes.length!==pointer.bytes||sha256(bytes)!==pointer.sha256)
    throw Error('G2_CANDIDATE_SNAPSHOT_CHECKSUM_FAILED')
  return {checkpoint:validateCandidateCheckpoint(
    JSON.parse(bytes.toString('utf8'))),generation}
}
export async function saveDurableCandidateCheckpoint(bucket,doc,{
  expectedGeneration='0',
}={}){
  if(!/^\d+$/.test(String(expectedGeneration)))
    throw Error('G2_CANDIDATE_EXPECTED_GENERATION_INVALID')
  const {bytes,hash}=serializeCheckpoint(doc)
  const name=CANDIDATE_CHECKPOINT_PREFIX+'/snapshots/'+randomUUID()+'.json'
  // Write immutable content first; pointer switches only on successful CAS.
  await bucket.file(name).save(bytes,{resumable:false,contentType:'application/json',
    preconditionOpts:{ifGenerationMatch:0}})
  const [readback]=await bucket.file(name).download()
  if(!readback.equals(bytes))throw Error('G2_CANDIDATE_UPLOAD_READBACK_FAILED')
  const pointer={kind:'youtube-g2-private-candidate-pointer',schemaVersion:1,
    object:name,sha256:hash,bytes:bytes.length}
  await bucket.file(CANDIDATE_CHECKPOINT_LATEST)
    .save(JSON.stringify(pointer),{resumable:false,contentType:'application/json',
      preconditionOpts:{ifGenerationMatch:Number(expectedGeneration)}})
  const current=await loadDurableCandidateCheckpoint(bucket)
  if(serializeCheckpoint(current.checkpoint).hash!==hash)
    throw Error('G2_CANDIDATE_POINTER_READBACK_FAILED')
  return {entries:doc.entries.length,hash,generation:current.generation}
}
async function withBucket(callback){
  const bucketName=process.env.DATA_CHECKPOINT_BUCKET
  if(bucketName!=='movie-hub-62459-nightly-checkpoints')
    throw Error('G2_PRIVATE_CHECKPOINT_BUCKET_REQUIRED')
  const [{applicationDefault,initializeApp,deleteApp},{getStorage}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/storage')])
  const app=initializeApp({credential:applicationDefault(),
    projectId:'movie-hub-62459'},'youtube-g2-private-candidates')
  try{return await callback(getStorage(app).bucket(bucketName))}
  finally{await deleteApp(app)}
}
export async function runCheckpointCommand(mode,{
  archivePath='artifacts/youtube-g2/trusted-known-candidates/qa.json',
  batchQaPath='artifacts/youtube-g2/full-catalog-queue/qa.json',
  outputPath='artifacts/youtube-g2/trusted-known-candidates/candidates.json',
  runId=Number(process.env.GITHUB_RUN_ID),
}={}){
  if(!['bootstrap','read','merge'].includes(mode))
    throw Error('G2_CANDIDATE_COMMAND_INVALID')
  return withBucket(async bucket=>{
    const existing=await loadDurableCandidateCheckpoint(bucket)
    if(mode==='read'){
      if(!existing.checkpoint)throw Error('G2_CANDIDATE_CHECKPOINT_NOT_BOOTSTRAPPED')
      await mkdir('artifacts/youtube-g2/trusted-known-candidates',{recursive:true})
      await writeFile(outputPath,JSON.stringify(existing.checkpoint)+'\n',{mode:0o600})
      return {mode,movies:existing.checkpoint.entries.length}
    }
    if(mode==='bootstrap'){
      if(existing.checkpoint)throw Error('G2_CANDIDATE_ALREADY_BOOTSTRAPPED')
      const archive=JSON.parse(await readFile(archivePath,'utf8'))
      const doc=createCandidateCheckpointFromArchive(archive)
      const saved=await saveDurableCandidateCheckpoint(bucket,doc,
        {expectedGeneration:existing.generation})
      return {mode,movies:saved.entries,hash:saved.hash}
    }
    if(!existing.checkpoint)throw Error('G2_CANDIDATE_CHECKPOINT_NOT_BOOTSTRAPPED')
    const qa=JSON.parse(await readFile(batchQaPath,'utf8'))
    const result=mergeCandidateCheckpoint(existing.checkpoint,qa,{runId})
    const saved=await saveDurableCandidateCheckpoint(bucket,result.checkpoint,
      {expectedGeneration:existing.generation})
    return {mode,movies:saved.entries,addedMovies:result.newMovies,
      addedCandidateIds:result.newIds,hash:saved.hash}
  })
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runCheckpointCommand(process.argv[2]).then(result=>console.log(
    JSON.stringify({...result,approvedOffers:0,playbackRoutesWritten:0,
      firestoreWrites:0}))).catch(error=>{
    console.error('PRIVATE YOUTUBE CANDIDATE CHECKPOINT FAILED CLOSED: '+error.message)
    process.exitCode=1
  })
}
