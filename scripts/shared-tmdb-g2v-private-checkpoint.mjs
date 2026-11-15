/**
 * #336 G2v: single private, generation-conditional GCS snapshot.
 * No public artifact, no raw key logging, no extra TMDB transport.
 */
import { isTrustedCentralNightlyEvent } from './trusted-central-nightly-event.mjs'
import { createHash } from 'node:crypto'
import { appendFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile, rename } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadOptionalSharedTmdbResponses, SHARED_TMDB_RESPONSE_STORE_MAX_BYTES } from './shared-tmdb-response-store.mjs'

export const G2V_OPT_IN = 'private-persistent-reuse-v1'
export const G2V_OBJECT = 'data-checkpoints/v1/shared-tmdb-response/latest.json'
const RELATIVE_DIR = 'artifacts/shared-tmdb/private'
const FILE = 'shared-tmdb-response-cache.json'
const RECEIPT = 'g2v-checkpoint-receipt.json'
const generationValid = x => typeof x === 'string' && /^[1-9][0-9]{0,23}$/.test(x)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const missing = e => Number(e?.code) === 404
const paths = root => {
  const directory = resolve(root,RELATIVE_DIR)
  return { directory, snapshot:join(directory,FILE), receipt:join(directory,RECEIPT) }
}
async function absent(path) {
  try { await lstat(path); return false } catch (e) { if (e?.code==='ENOENT') return true; throw e }
}
async function readRemote(bucket) {
  let metadata
  try { [metadata]=await bucket.file(G2V_OBJECT).getMetadata() }
  catch(e) { if(missing(e)) return null; throw e }
  const generation=String(metadata?.generation??'')
  const size=Number(metadata?.size)
  if(!generationValid(generation)||!Number.isSafeInteger(size)||size<1||size>SHARED_TMDB_RESPONSE_STORE_MAX_BYTES)
    throw new Error('G2V_REMOTE_METADATA_REJECTED')
  const [bytes]=await bucket.file(G2V_OBJECT,{generation}).download({validation:'crc32c'})
  if(!Buffer.isBuffer(bytes)||bytes.length!==size) throw new Error('G2V_REMOTE_SIZE_REJECTED')
  return {generation,bytes}
}

export async function restoreG2vCheckpoint({root,bucket,now=Date.now()}) {
  if(!Number.isSafeInteger(now)||now<=0) throw new Error('G2V_CLOCK_REJECTED')
  const p=paths(root)
  if(!await absent(p.snapshot)||!await absent(p.receipt)||!await absent(p.snapshot+'.lock'))
    throw new Error('G2V_LOCAL_NOT_EMPTY')
  await mkdir(p.directory,{recursive:true,mode:0o700})
  for (const parent of [resolve(root,'artifacts'),resolve(root,'artifacts/shared-tmdb')]) {
    const info=await lstat(parent)
    if (!info.isDirectory()||info.isSymbolicLink()) throw new Error('G2V_PARENT_REJECTED')
  }
  const dirInfo=await lstat(p.directory)
  if(!dirInfo.isDirectory()||dirInfo.isSymbolicLink()||(dirInfo.mode&0o077)!==0)
    throw new Error('G2V_PRIVATE_DIR_REJECTED')
  const remote=await readRemote(bucket)
  const receipt={kind:'g2v-checkpoint-receipt',version:1,startedAt:now,
    generation:remote?.generation??null,digest:remote?digest(remote.bytes):null}
  let entries=0
  if(remote) {
    const temp=await mkdtemp(join(p.directory,'restore-'))
    try {
      const staged=join(temp,FILE)
      await writeFile(staged,remote.bytes,{flag:'wx',mode:0o600})
      const validated=await loadOptionalSharedTmdbResponses(staged,{now})
      if(validated.status!=='loaded') throw new Error('G2V_REMOTE_SNAPSHOT_REJECTED')
      entries=validated.entries
      await rename(staged,p.snapshot)
    } finally { await rm(temp,{recursive:true,force:true}) }
  }
  await writeFile(p.receipt,JSON.stringify(receipt),{flag:'wx',mode:0o600})
  return {status:remote?'restored':'cold_start',restoredResponses:entries,startedAt:now}
}

export async function saveG2vCheckpoint({root,bucket,now=Date.now()}) {
  const p=paths(root)
  const info=await lstat(p.receipt)
  if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0||info.size>1024)
    throw new Error('G2V_RECEIPT_REJECTED')
  const receipt=JSON.parse(await readFile(p.receipt,'utf8'))
  if(receipt.kind!=='g2v-checkpoint-receipt'||receipt.version!==1||
      !Number.isSafeInteger(receipt.startedAt)||receipt.startedAt>now||now-receipt.startedAt>24*3600000||
      !(receipt.generation===null&&receipt.digest===null ||
        generationValid(receipt.generation)&&/^[a-f0-9]{64}$/.test(receipt.digest??'')))
    throw new Error('G2V_RECEIPT_REJECTED')
  const validated=await loadOptionalSharedTmdbResponses(p.snapshot,{now})
  if(validated.status==='missing') return {status:'no_snapshot',savedResponses:0}
  if(validated.status!=='loaded') throw new Error('G2V_LOCAL_SNAPSHOT_REJECTED')
  const bytes=await readFile(p.snapshot)
  if(bytes.length>SHARED_TMDB_RESPONSE_STORE_MAX_BYTES) throw new Error('G2V_LOCAL_SIZE_REJECTED')
  const sha=digest(bytes)
  if(sha===receipt.digest) return {status:'unchanged',savedResponses:validated.entries}
  // Compare-and-swap on the exact cloud generation restored by this runner.
  // A conflicting writer cannot overwrite the latest verified snapshot.
  await bucket.file(G2V_OBJECT).save(bytes,{resumable:false,validation:'crc32c',
    contentType:'application/json',metadata:{cacheControl:'private, no-store'},
    preconditionOpts:{ifGenerationMatch:receipt.generation??0}})
  const persisted=await readRemote(bucket)
  if(!persisted||digest(persisted.bytes)!==sha) throw new Error('G2V_REMOTE_VERIFY_REJECTED')
  return {status:'saved_verified',savedResponses:validated.entries}
}

async function main(){
  const [mode]=process.argv.slice(2)
  if(!['restore','save'].includes(mode)||process.argv.length!==3||
     !isTrustedCentralNightlyEvent(process.env)||
     process.env.MOVIEHUB_G2V_PERSISTENT!==G2V_OPT_IN||
     process.env.DATA_CHECKPOINT_ENABLED!=='true'||
     process.env.DATA_CHECKPOINT_BUCKET!=='movie-hub-62459-nightly-checkpoints')
    throw new Error('G2V_APPROVAL_REJECTED')
  const [{applicationDefault,initializeApp,deleteApp},{getStorage}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/storage')])
  const app=initializeApp({credential:applicationDefault(),projectId:'movie-hub-62459'},'g2v-private-checkpoint')
  try{
    const bucket=getStorage(app).bucket(process.env.DATA_CHECKPOINT_BUCKET)
    const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
    const result=mode==='restore'?await restoreG2vCheckpoint({root,bucket}):await saveG2vCheckpoint({root,bucket})
    if(mode==='restore') await appendFile(process.env.GITHUB_OUTPUT,'started_at='+result.startedAt+'\n')
    console.log(JSON.stringify({kind:'g2v-private-checkpoint-counts',mode,...result}))
  }finally{await deleteApp(app)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{console.error('G2v private checkpoint unavailable; original adapter fallback retained');process.exitCode=1})
}
