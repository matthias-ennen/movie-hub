import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {pacificSearchDay}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'
import {
  readSharedSearchLedger,TARGET_SEARCH_CAP,
} from '../scripts/youtube-g2-shared-search-gateway.mjs'
import {createSharedSearchYoutubeApi}
  from '../scripts/youtube-g2-shared-search-transport.mjs'

const NOW='2026-10-28T17:00:00.000Z'
const DAY=pacificSearchDay(NOW)
const approval={
  kind:'moviehub-youtube-project-quota-approval-v1',
  projectId:'movie-hub-62459',googleSearchLimitVerified:100,
  sharedSearchDayCap:95,allSearchCallersMigrated:true,
  externalConsumersAccountedFor:true,explicitOperatorApproval:true,
  reviewedAt:'2026-10-28T16:00:00.000Z',
}
const searchParams={part:'snippet',type:'video',videoType:'movie',
  q:'fictional sample film',maxResults:25}
function fakeBucket(){
  const stored=new Map()
  return {
    name:'movie-hub-62459-nightly-checkpoints',stored,
    file(path,options={}){
      return {
        async getMetadata(){
          const row=stored.get(path)
          if(!row)throw Object.assign(Error('missing'),{code:404})
          return [{generation:String(row.generation)}]
        },
        async download(){
          const row=stored.get(path)
          if(!row||options.generation
            &&String(options.generation)!==String(row.generation))
            throw Object.assign(Error('missing version'),{code:404})
          return [Buffer.from(row.bytes)]
        },
        async save(bytes,{preconditionOpts,contentType,resumable}={}){
          const row=stored.get(path),version=row?.generation??0
          if(preconditionOpts?.ifGenerationMatch!==version)
            throw Object.assign(Error('CAS conflict'),{code:412})
          expect(contentType).toBe('application/json')
          expect(resumable).toBe(false)
          stored.set(path,{generation:version+1,bytes:Buffer.from(bytes)})
        },
      }
    },
  }
}
function setup({transport=vi.fn(async()=>({items:[]})),
  admission=approval,runId=881201,bucket=fakeBucket()}={}){
  const api=createSharedSearchYoutubeApi({
    bucket,admission,runId,apiKey:'TEST_KEY_ONLY',transport,now:()=>NOW,
  })
  return {api,transport,bucket}
}

describe('YouTube #388 staged shared-search transport – never live by default',()=>{
  it('refuses search before independently-approved readiness and never calls API',async()=>{
    const s=setup({admission:null})
    await expect(s.api('search',searchParams))
      .rejects.toThrow('YOUTUBE_SHARED_SEARCH_PROJECT_NOT_APPROVED')
    expect(s.transport).not.toHaveBeenCalled()
    expect(s.bucket.stored.size).toBe(0)
  })
  it('performs one search only after durable CAS reservation; no duplicate transport',async()=>{
    const transport=vi.fn(async(path,params,key)=>{
      expect(path).toBe('search')
      expect(params).toEqual(searchParams)
      expect(key).toBe('TEST_KEY_ONLY')
      return {items:[{id:{videoId:'TESTONLY123'}}]}
    })
    const s=setup({transport})
    const result=await s.api('search',searchParams)
    expect(result.items).toHaveLength(1)
    expect(transport).toHaveBeenCalledTimes(1)
    const read=await readSharedSearchLedger(s.bucket,DAY)
    expect(read.ledger.records).toMatchObject([
      {runId:881201,attemptNumber:1,state:'success'},
    ])
    expect(JSON.stringify(read.ledger)).not.toContain('fictional sample')
    expect(JSON.stringify(read.ledger)).not.toContain('TEST_KEY_ONLY')
  })
  it('does not reserve a search for a normal videos.list lookup',async()=>{
    const s=setup()
    await s.api('videos',{part:'snippet',id:'TESTONLY123'})
    expect(s.transport).toHaveBeenCalledWith('videos',
      {part:'snippet',id:'TESTONLY123'},'TEST_KEY_ONLY')
    expect(s.bucket.stored.size).toBe(0)
  })
  it('rejects unknown endpoints and malformed search before GCS or network',async()=>{
    const s=setup()
    await expect(s.api('badEndpoint',{foo:1}))
      .rejects.toThrow('YOUTUBE_SHARED_SEARCH_ENDPOINT_FORBIDDEN')
    await expect(s.api('search',{part:'snippet',type:'channel'}))
      .rejects.toThrow('YOUTUBE_SHARED_SEARCH_QUERY_NOT_ALLOWED')
    await expect(s.api('search',{part:'snippet',type:'video',
      videoType:'episode'})).rejects.toThrow('YOUTUBE_SHARED_SEARCH_QUERY_NOT_ALLOWED')
    await expect(s.api('search',null))
      .rejects.toThrow('YOUTUBE_SHARED_SEARCH_API_REQUEST_INVALID')
    expect(s.bucket.stored.size).toBe(0)
    expect(s.transport).not.toHaveBeenCalled()
  })
  it('classifies 403 quota exhaustion, halts later searches without repeat',async()=>{
    const transport=vi.fn(async()=>{throw Error('QUOTA_EXHAUSTED')})
    const s=setup({transport})
    await expect(s.api('search',searchParams)).rejects.toThrow('QUOTA_EXHAUSTED')
    await expect(s.api('search',searchParams))
      .rejects.toThrow('YOUTUBE_SHARED_SEARCH_DAY_HALTED')
    expect(transport).toHaveBeenCalledTimes(1)
    const doc=(await readSharedSearchLedger(s.bucket,DAY)).ledger
    expect(doc.haltedForQuota).toBe(true)
    expect(doc.records).toMatchObject([{state:'quota-exceeded'}])
  })
  it('keeps HTTP 429 separate from hard daily 403; never retries the failed call',async()=>{
    const transport=vi.fn().mockRejectedValueOnce(Error('RATE_LIMITED'))
      .mockResolvedValueOnce({items:[]})
    const s=setup({transport})
    await expect(s.api('search',searchParams)).rejects.toThrow('RATE_LIMITED')
    const first=(await readSharedSearchLedger(s.bucket,DAY)).ledger
    expect(first.haltedForQuota).toBe(false)
    expect(first.records[0].state).toBe('rate-limited')
    await s.api('search',searchParams)
    expect(transport).toHaveBeenCalledTimes(2)
    const doc=(await readSharedSearchLedger(s.bucket,DAY)).ledger
    expect(doc.records.map(r=>[r.attemptNumber,r.state]))
      .toEqual([[1,'rate-limited'],[2,'success']])
  })
  it('retains an uncertain API failure as spent with no automatic retry',async()=>{
    const s=setup({transport:vi.fn(async()=>{throw Error('network reset')})})
    await expect(s.api('search',searchParams)).rejects.toThrow('network reset')
    const doc=(await readSharedSearchLedger(s.bucket,DAY)).ledger
    expect(doc.records).toMatchObject([{attemptNumber:1,
      state:'failed-unknown'}])
    expect(s.transport).toHaveBeenCalledTimes(1)
  })
  it('increments attempt identity before asynchronous transport, no shared slot reuse',async()=>{
    const s=setup()
    const results=await Promise.all([
      s.api('search',searchParams),s.api('search',searchParams),
    ])
    expect(results).toHaveLength(2)
    expect(s.transport).toHaveBeenCalledTimes(2)
    const doc=(await readSharedSearchLedger(s.bucket,DAY)).ledger
    expect(doc.records.map(r=>r.attemptNumber).sort()).toEqual([1,2])
  })
  it('requires a unique real run id and private bucket at factory creation',()=>{
    for(const options of [
      {runId:0},{runId:1.5},{apiKey:''},
      {bucket:{name:'not-private',file:()=>{}}},{transport:null},
    ]){
      expect(()=>createSharedSearchYoutubeApi({
        bucket:fakeBucket(),admission:approval,runId:881201,
        apiKey:'TEST_KEY_ONLY',now:()=>NOW,...options,
      })).toThrow('YOUTUBE_SHARED_SEARCH_TRANSPORT_NOT_CONFIGURED')
    }
  })
  it('preserves the productive v1 10/1 day guard; not wired to workflows',()=>{
    const src=readFileSync(new URL(
      '../scripts/youtube-g2-atomic-search-budget-ledger.mjs',import.meta.url),'utf8')
    expect(src).toContain('ADAPTER_SEARCH_DAY_CAP=10')
    expect(src).toContain('DEGRADED_ONE_SEARCH_DAY_CAP=1')
    const jobs=['youtube-g2-nightly-discovery',
      'youtube-g2-five-search-public-batch',
      'youtube-g2-full-catalog-queue']
    for(const name of jobs){
      const text=readFileSync(new URL(
        '../.github/workflows/'+name+'.yml',import.meta.url),'utf8')
      expect(text).not.toContain('youtube-g2-shared-search-transport.mjs')
    }
    expect(TARGET_SEARCH_CAP).toBe(95)
  })
})
