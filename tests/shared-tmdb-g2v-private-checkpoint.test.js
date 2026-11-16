import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { restoreG2vCheckpoint, saveG2vCheckpoint, G2V_OBJECT } from '../scripts/shared-tmdb-g2v-private-checkpoint.mjs'
import { openOptionalSharedTmdbCapture, g2vPersistentObservation } from '../scripts/shared-tmdb-adapter-capture-stage.mjs'
import { SharedTmdbResponseStore, SHARED_TMDB_RESPONSE_STORE_TTL_MS, SHARED_TMDB_RESPONSE_STORE_MAX_ENTRIES } from '../scripts/shared-tmdb-response-store.mjs'
import { SHARED_TMDB_SEARCH_NAMESPACE } from '../scripts/shared-tmdb-search-response-cache.mjs'

const N=Date.parse('2026-11-14T00:00:00Z')
const roots=[]
const root=async()=>{const dir=await mkdtemp(join(tmpdir(),'mh-g2v-'));roots.push(dir);return dir}
afterEach(async()=>{await Promise.all(roots.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))})
const key=x=>JSON.stringify(['/search/movie',{language:'de-DE',query:'SYNTHETIC '+x,include_adult:'false'}])
const answer={results:[{id:111,title:'SYNTHETIC'}]}
const snapshot=r=>join(r,'artifacts/shared-tmdb/private/shared-tmdb-response-cache.json')
const session=(r,sourceId,now,started)=>openOptionalSharedTmdbCapture({sourceId,enabled:true,projectRoot:r,now,reuse:true,persistent:true,runStartedAt:started})
function fakeBucket(){
  let bytes=null,generation=0,writes=0
  const error=code=>Object.assign(new Error('fake storage'),{code})
  return {
    writes:()=>writes,
    change:()=>{generation++},
    corrupt:()=>{bytes=Buffer.from('invalid');generation++},
    file(name,options={}){
      expect(name).toBe(G2V_OBJECT)
      return {
        async getMetadata(){if(!bytes)throw error(404);return [{generation:String(generation),size:String(bytes.length)}]},
        async download(opts){expect(opts.validation).toBe('crc32c');if(!bytes||options.generation!==String(generation))throw error(404);return [Buffer.from(bytes)]},
        async save(value,opts){expect(opts.metadata.cacheControl).toBe('private, no-store');if(String(opts.preconditionOpts.ifGenerationMatch)!==String(generation))throw error(412);bytes=Buffer.from(value);generation++;writes++},
      }
    }
  }
}

it('cold seed, durable restore, both adapters distinguish prior-night and same-run hits without renewing TTL',async()=>{
  const bucket=fakeBucket(),a=await root(),b=await root()
  expect(await restoreG2vCheckpoint({root:a,bucket,now:N})).toMatchObject({status:'cold_start',restoredResponses:0})
  const w=await session(a,'waipu',N+1000,N)
  expect(w.responseCache.set(key('a'),answer)).toBe(true)
  expect(w.responseCache.get(key('a'))).toBeNull()
  expect(await w.complete({sourceGenerationComplete:true})).toMatchObject({status:'saved'})
  const j=await session(a,'joyn',N+2000,N)
  expect(j.responseCache.get(key('a'))).toEqual(answer)
  expect(j.summary()).toMatchObject({priorRunHits:0,sameRunHits:1})
  expect(await j.complete({sourceGenerationComplete:true})).toMatchObject({status:'no_new_responses'})
  expect(await saveG2vCheckpoint({root:a,bucket,now:N+3000})).toMatchObject({status:'saved_verified',savedResponses:1})
  const next=N+86400000
  expect(await restoreG2vCheckpoint({root:b,bucket,now:next})).toMatchObject({status:'restored',restoredResponses:1})
  expect((await stat(snapshot(b))).mode&0o777).toBe(0o600)
  const w2=await session(b,'waipu',next+1000,next)
  expect(w2.responseCache.get(key('a'))).toEqual(answer)
  expect(w2.responseCache.set(key('b'),answer)).toBe(true)
  const done=await w2.complete({sourceGenerationComplete:true})
  expect(g2vPersistentObservation('waipu',w2,done,1)).toMatchObject({priorRunHits:1,sameRunHits:0,avoidedInitialSearches:1})
  const j2=await session(b,'joyn',next+2000,next)
  expect(j2.responseCache.get(key('a'))).toEqual(answer)
  expect(j2.responseCache.get(key('b'))).toEqual(answer)
  expect(j2.summary()).toMatchObject({priorRunHits:1,sameRunHits:1})
  expect(JSON.parse(await readFile(snapshot(b),'utf8')).entries.find(x=>x.requestKey===key('a')).checkedAt).toBe(new Date(N+1000).toISOString())
  expect(await saveG2vCheckpoint({root:b,bucket,now:next+3000})).toMatchObject({status:'saved_verified',savedResponses:2})
  const c=await root()
  const late=N+1000+SHARED_TMDB_RESPONSE_STORE_TTL_MS
  expect(await restoreG2vCheckpoint({root:c,bucket,now:late})).toMatchObject({restoredResponses:1})
  const w3=await session(c,'waipu',late,late)
  expect(w3.responseCache.get(key('a'))).toBeNull()
  expect(w3.responseCache.get(key('b'))).toEqual(answer)
  expect(await saveG2vCheckpoint({root:c,bucket,now:late})).toMatchObject({status:'unchanged'})
  expect(bucket.writes()).toBe(2)
})

it('rejects cloud generation races and corrupt remote snapshots without writes',async()=>{
  const bucket=fakeBucket(),a=await root()
  await restoreG2vCheckpoint({root:a,bucket,now:N})
  const w=await session(a,'waipu',N+1000,N)
  w.responseCache.set(key('a'),answer)
  await w.complete({sourceGenerationComplete:true})
  await saveG2vCheckpoint({root:a,bucket,now:N+2000})
  const b=await root()
  await restoreG2vCheckpoint({root:b,bucket,now:N+3000})
  const w2=await session(b,'waipu',N+4000,N+3000)
  w2.responseCache.set(key('b'),answer)
  await w2.complete({sourceGenerationComplete:true})
  bucket.change()
  await expect(saveG2vCheckpoint({root:b,bucket,now:N+5000})).rejects.toMatchObject({code:412})
  bucket.corrupt()
  await expect(restoreG2vCheckpoint({root:await root(),bucket,now:N+6000})).rejects.toThrow('G2V_REMOTE_SNAPSHOT_REJECTED')
  expect(bucket.writes()).toBe(1)
})

it('rolling cap evicts oldest fetched entry, and invalid responses cannot evict',()=>{
  const ns=SHARED_TMDB_SEARCH_NAMESPACE
  const entries=Array.from({length:SHARED_TMDB_RESPONSE_STORE_MAX_ENTRIES},(_,i)=>({requestKey:key(i),checkedAt:new Date(N-10000+i).toISOString(),value:answer}))
  const s=new SharedTmdbResponseStore({now:N,entries})
  expect(s.set(ns,key('invalid'),{}, {rolling:true})).toBe(false)
  expect(s.get(ns,key(0))).toEqual(answer)
  expect(s.set(ns,key('new'),answer,{rolling:true})).toBe(true)
  expect(s.get(ns,key(0))).toBeNull()
  expect(s.get(ns,key('new'))).toEqual(answer)
  expect(s.values.size).toBe(SHARED_TMDB_RESPONSE_STORE_MAX_ENTRIES)
})


it('persists the surviving adapter across a peer failure without saving incomplete responses',async()=>{
  const bucket=fakeBucket(),first=await root(),next=await root(),later=await root()
  await restoreG2vCheckpoint({root:first,bucket,now:N})
  const seeded=await session(first,'waipu',N+1000,N)
  seeded.responseCache.set(key('old'),answer)
  await seeded.complete({sourceGenerationComplete:true})
  await saveG2vCheckpoint({root:first,bucket,now:N+2000})
  const day=N+86400000
  await restoreG2vCheckpoint({root:next,bucket,now:day})
  const failed=await session(next,'waipu',day+1000,day)
  failed.responseCache.set(key('incomplete'),answer)
  expect(await failed.complete({sourceGenerationComplete:false})).toMatchObject({status:'not_complete'})
  const survivor=await session(next,'joyn',day+2000,day)
  expect(survivor.responseCache.get(key('old'))).toEqual(answer)
  expect(survivor.responseCache.get(key('incomplete'))).toBeNull()
  survivor.responseCache.set(key('joyn'),answer)
  await survivor.complete({sourceGenerationComplete:true})
  expect(await saveG2vCheckpoint({root:next,bucket,now:day+3000})).toMatchObject({status:'saved_verified',savedResponses:2})
  const d2=day+86400000
  await restoreG2vCheckpoint({root:later,bucket,now:d2})
  const w=await session(later,'waipu',d2+1000,d2)
  expect(w.responseCache.get(key('joyn'))).toEqual(answer)
  w.responseCache.set(key('waipu'),answer)
  await w.complete({sourceGenerationComplete:true})
  const j=await session(later,'joyn',d2+2000,d2)
  j.responseCache.set(key('incomplete-joyn'),answer)
  await j.complete({sourceGenerationComplete:false})
  expect(await saveG2vCheckpoint({root:later,bucket,now:d2+3000})).toMatchObject({status:'saved_verified',savedResponses:3})
  const raw=JSON.parse(await readFile(snapshot(later),'utf8'))
  expect(raw.entries.map(e=>e.requestKey)).not.toContain(key('incomplete-joyn'))
})

it('workflow keeps persistent reuse central, full and private with scheduled production defaults',async()=>{
  const central=await readFile('.github/workflows/moviehub-nightly-pipeline.yml','utf8')
  const deploy=await readFile('.github/workflows/deploy-firebase.yml','utf8')
  expect(central).toContain("default: 'private-persistent'")
  expect(central).toContain("github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && inputs.run_mode == 'full' && inputs.shared_tmdb_cache == 'private-persistent')")
  expect(central).toContain("github.event_name == 'workflow_dispatch' && inputs.run_mode == 'full' && inputs.shared_tmdb_cache == 'private-persistent'")
  expect(deploy).toContain("(github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/main' && inputs.nightly_chain && inputs.data_mode == 'standard' && inputs.shared_tmdb_cache == 'private-persistent'")
  const joyn = deploy.slice(deploy.indexOf('id: joyn_catalog'), deploy.indexOf('id: g2w_stage'))
  expect(joyn).toContain("steps.g2v_restore.outcome == 'success' && 'private-persistent-reuse-v1'")
  expect(deploy.indexOf('id: g2v_save')).toBeGreaterThan(deploy.indexOf('id: g2w_preview'))
  const save = deploy.match(/id: g2v_save\s+if: \$\{\{ ([^\n]+?) \}\}/)?.[1]
  expect(save).toBeTruthy()
  const allowed = Function('steps','return '+save)
  for (const waipu of ['success','failure','skipped']) {
    for (const joyn of ['success','failure','skipped']) {
      for (const xmltv of ['success','failure','skipped']) {
        const steps={g2v_restore:{outcome:'success'},waipu_catalog:{outcome:waipu},joyn_catalog:{outcome:joyn},g2w_preview:{outcome:xmltv}}
        expect(allowed(steps)).toBe(waipu==='success'||joyn==='success'||xmltv==='success')
        expect(allowed({...steps,g2v_restore:{outcome:'failure'}})).toBe(false)
      }
    }
  }
  expect(deploy).not.toContain('path: artifacts/shared-tmdb/private')
})
