import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {runNightlyDiscovery,validateNightlyDiscoveryPreflight}
  from '../scripts/youtube-g2-nightly-discovery-live.mjs'
import {
  loadNightlyQueue,
} from '../scripts/youtube-g2-nightly-queue.mjs'
import {
  saveDurableCandidateCheckpoint,loadDurableCandidateCheckpoint,
} from '../scripts/youtube-g2-durable-candidate-checkpoint.mjs'
import {evaluatePacificSearchBudget,RATE,QUOTA}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'
import {reserveWithAtomicGcs,isDegradedOneSearchPreflight}
  from '../scripts/youtube-g2-atomic-search-budget-ledger.mjs'

const NOW='2026-10-25T18:00:00.000Z'
const sample={timeSeries:[{
  metric:{type:RATE,labels:{quota_metric:QUOTA}},
  resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
  points:[{
    interval:{startTime:'2026-10-25T17:49:00Z',
      endTime:'2026-10-25T17:50:00Z'},
    value:{int64Value:'5'},
  }],
}]}
const preflight=()=>evaluatePacificSearchBudget({
  now:NOW,rateHttp:200,rateResponse:sample,
  exceededHttp:200,exceededResponse:{timeSeries:[]},
})
const checkpoint={
  kind:'moviehub-youtube-g2-known-video-candidates',schemaVersion:1,
  createdAt:'2026-10-25T16:00:00.000Z',
  updatedAt:'2026-10-25T17:00:00.000Z',
  evidenceStatus:'candidate-only-not-independent-DE-offer',
  verifiedDEOffers:0,approvedDirectRoutes:0,productionWrites:0,
  entries:[{tmdbId:101,videoIds:['Abc12345678'],
    provenance:[{kind:'original-trusted-25-film-archive',runId:401001}]}],
}
const publicIndex=()=>({
  kind:'search-index',version:1,country:'DE',source:'tmdb',
  generatedAt:'2026-10-25T17:55:00Z',
  entries:[
    ...[101,102,103,104].map(tmdbId=>({
      type:'movie',tmdbId,title:'Film '+tmdbId,
      originalTitle:'Film '+tmdbId,year:2000,providerIds:['youtube'],
    })),
    ...Array.from({length:102},(_,i)=>({
      type:'movie',tmdbId:10000+i,title:'Other '+i,
      year:2010,providerIds:['google-tv'],
    })),
  ],count:106,
})
function bucket(){
  const objects=new Map()
  return {
    name:'movie-hub-62459-nightly-checkpoints',objects,
    file(name,options={}){
      return {
        async getMetadata(){
          const v=objects.get(name)
          if(!v)throw Object.assign(Error('missing'),{code:404})
          return [{generation:String(v.generation)}]
        },
        async download(){
          const v=objects.get(name)
          if(!v||options.generation&&String(options.generation)!==String(v.generation))
            throw Object.assign(Error('missing'),{code:404})
          return [Buffer.from(v.bytes)]
        },
        async save(data,opts){
          const v=objects.get(name)
          const generation=v?.generation??0
          if(opts?.preconditionOpts?.ifGenerationMatch!==generation)
            throw Object.assign(Error('CAS precondition'),{code:412})
          objects.set(name,{generation:generation+1,bytes:Buffer.from(data)})
        },
      }
    },
  }
}
async function seededBucket(){
  const b=bucket()
  await saveDurableCandidateCheckpoint(b,checkpoint,{expectedGeneration:'0'})
  return b
}
function services(){
  const tmdbGet=vi.fn(async path=>{
    if(path==='/watch/providers/movie')return {
      results:[{provider_name:'YouTube',provider_id:192}],
    }
    if(/^\/movie\/\d+\/watch\/providers$/.test(path)){
      const id=Number(path.split('/')[2])
      return {results:{DE:id===103?{buy:[{provider_id:3}]}:{
        rent:[{provider_id:192}],
      }}}
    }
    if(/^\/movie\/\d+$/.test(path)){
      const id=Number(path.split('/')[2])
      return {id,title:'Film '+id,original_title:'Film '+id,
        release_date:'2000-01-01',runtime:100,credits:{crew:[]},
        alternative_titles:{titles:[]}}
    }
    throw Error('Unexpected TMDB endpoint')
  })
  const youtubeApi=vi.fn(async endpoint=>{
    if(endpoint==='search')return {items:[]}
    if(endpoint==='videos')return {items:[]}
    throw Error('Unexpected YouTube endpoint')
  })
  return {tmdbGet,youtubeApi}
}
describe('scheduled nightly movie research: shared 50 PT calls and private resume',()=>{
  it('uses two actual search calls, skips a known ID and no-offer case, saves cursor',async()=>{
    const b=await seededBucket(),s=services()
    const summary=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:preflight(),
      runId:610101,now:()=>NOW,wait:async()=>{},...s,
    })
    expect(summary).toMatchObject({
      dayLimit:50,priorReserved:0,publicBadgeFilms:4,
      previouslyKnownVideoFilms:1,selectedForSearch:2,
      checkedNoOffer:1,searchCalls:2,videoDetailCalls:0,
      finishedWithoutCandidates:2,status:'completed',
      independentlyVerifiedDEOffers:0,publicationPermitted:false,
      firestoreWrites:0,providerWrites:0,badgeWrites:0,
    })
    expect(s.youtubeApi.mock.calls.map(x=>x[0])).toEqual(['search','search'])
    const cursor=(await loadNightlyQueue(b)).queue
    expect(cursor.entries.map(e=>[e.tmdbId,e.state])).toEqual([
      [102,'no-video-candidates'],[103,'no-current-offer'],
      [104,'no-video-candidates'],
    ])
    const candidates=await loadDurableCandidateCheckpoint(b)
    expect(candidates.checkpoint.entries).toHaveLength(1)
  })
  it('stops on confirmed Google quota and journals every attempted search',async()=>{
    const b=await seededBucket(),svc=services()
    let calls=0
    svc.youtubeApi.mockImplementation(async endpoint=>{
      if(endpoint==='search'){
        if(++calls===2)
          throw Error('YouTube API: HTTP 403 bei search [QUOTA_EXHAUSTED]. Kein Retry.')
        return {items:[]}
      }
      return {items:[]}
    })
    const r=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:null,
      quotaObservationMode:true,runId:630101,now:()=>NOW,wait:async()=>{},...svc,
    })
    expect(r).toMatchObject({
      dayLimit:null,quotaMode:'google-enforced-no-internal-daily-cap',
      status:'quota-exhausted-confirmed',quotaExceededConfirmed:true,
      searchCalls:2,successfulSearchCalls:1,
      selectedForSearch:2,priorReserved:null,
      terminationReason:'youtube-search-list-403-quotaExceeded',
      publicationPermitted:false,independentlyVerifiedDEOffers:0,
    })
    const journals=[...b.objects].filter(([k])=>k.includes('private-nightly-search-journal'))
    expect(journals).toHaveLength(1)
    expect(JSON.parse(journals[0][1].bytes.toString('utf8'))).toMatchObject({
      attempts:2,successful:1,quotaRejected:1,state:'quota-exhausted',
    })
    expect(svc.youtubeApi.mock.calls.filter(x=>x[0]==='search')).toHaveLength(2)
  })
  it('accepts explicit quotaExceeded on HTTP 429 as a normal terminal condition',async()=>{
    const b=await seededBucket(),svc=services()
    svc.youtubeApi.mockRejectedValue(
      Error('YouTube API: HTTP 429 bei search [QUOTA_EXHAUSTED]'))
    const r=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,quotaObservationMode:true,
      preflight:null,runId:630151,now:()=>NOW,wait:async()=>{},...svc,
    })
    expect(r).toMatchObject({
      status:'quota-exhausted-confirmed',
      quotaExceededConfirmed:true,searchCalls:1,
      successfulSearchCalls:0,
    })
    expect(svc.youtubeApi).toHaveBeenCalledTimes(1)
  })
  it('holds a sustained rate limit with long backoff and counts every retry',async()=>{
    const b=await seededBucket(),svc=services(),waits=[]
    svc.youtubeApi.mockRejectedValue(
      Error('YouTube API: HTTP 429 bei search [RATE_LIMITED]'))
    const result=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,quotaObservationMode:true,
      preflight:null,runId:630152,now:()=>NOW,
      wait:async ms=>{waits.push(ms)},...svc,
    })
    expect(result).toMatchObject({
      status:'rate-limited-stalled',quotaExceededConfirmed:false,
      searchCalls:10,rateLimitResponses:10,
      successfulSearchCalls:0,
      terminationReason:'youtube-search-rate-limit-not-confirmed-quota',
    })
    expect(svc.youtubeApi).toHaveBeenCalledTimes(10)
    expect(Math.max(...waits)).toBeGreaterThanOrEqual(180000)
    const journal=JSON.parse([...b.objects].find(([k])=>
      k.includes('private-nightly-search-journal'))[1].bytes.toString('utf8'))
    expect(journal).toMatchObject({
      state:'rate-limited',attempts:10,successful:0,
      rateLimited:10,pendingAttempts:0,quotaRejected:0,
    })
  })
  it('does not retry an already finalized rate-limited GitHub run',async()=>{
    const b=await seededBucket(),svc=services()
    svc.youtubeApi.mockRejectedValue(Error('YouTube API: HTTP 429 bei search [RATE_LIMITED]'))
    const opts={publicIndex:publicIndex(),bucket:b,quotaObservationMode:true,
      preflight:null,runId:630153,now:()=>NOW,wait:async()=>{},...svc}
    const first=await runNightlyDiscovery(opts)
    expect(first).toMatchObject({status:'rate-limited-stalled',searchCalls:10})
    svc.youtubeApi.mockClear()
    const second=await runNightlyDiscovery(opts)
    expect(second).toMatchObject({
      status:'rate-limited-stalled',quotaExceededConfirmed:false,
      searchCalls:10,terminationReason:'youtube-search-rate-limit-not-confirmed-quota',
    })
    expect(svc.youtubeApi).not.toHaveBeenCalled()
  })
  it('runs all eligible movies without requiring Monitoring evidence',async()=>{
    const b=await seededBucket(),svc=services()
    const r=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,quotaObservationMode:true,
      preflight:null,runId:630201,now:()=>NOW,wait:async()=>{},...svc,
    })
    expect(r).toMatchObject({
      quotaMode:'google-enforced-no-internal-daily-cap',
      searchCalls:2,successfulSearchCalls:2,quotaExceededConfirmed:false,
      status:'completed',
      terminationReason:'eligible-tmdb-film-candidates-exhausted',
    })
  })
  it('rejects plain HTTP 403 and retries a transient rate-limit only within bounds',async()=>{
    for(const [message,expectedAttempts] of [
      ['YouTube API: HTTP 403 bei search [API_REQUEST_REJECTED]',1],
      ['YouTube API: HTTP 503 bei search [API_REQUEST_REJECTED]',5],
    ]){
      const b=await seededBucket(),svc=services()
      svc.youtubeApi.mockRejectedValue(Error(message))
      await expect(runNightlyDiscovery({
        publicIndex:publicIndex(),bucket:b,quotaObservationMode:true,
        preflight:null,runId:630301,now:()=>NOW,wait:async()=>{},...svc,
      })).rejects.toThrow(message)
      expect(svc.youtubeApi).toHaveBeenCalledTimes(expectedAttempts)
      const journal=JSON.parse([...b.objects].find(([k])=>
        k.includes('private-nightly-search-journal'))[1].bytes.toString('utf8'))
      expect(journal.attempts).toBe(expectedAttempts)
      expect(journal.pendingAttempts).toBe(0)
    }
  })
  it('ignores earlier manual reservations because only Google enforces live quota',async()=>{
    const b=await seededBucket(),svc=services()
    await reserveWithAtomicGcs(b,{
      now:NOW,runId:630401,calls:50,preflight:preflight(),
    })
    const r=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,quotaObservationMode:true,
      preflight:null,runId:630402,now:()=>NOW,wait:async()=>{},...svc,
    })
    expect(r).toMatchObject({
      dayLimit:null,priorReserved:null,selectedForSearch:2,searchCalls:2,
      successfulSearchCalls:2,quotaExceededConfirmed:false,
    })
    const ledger=JSON.parse([...b.objects].find(([k])=>
      k.includes('private-search-budget'))[1].bytes.toString('utf8'))
    expect(ledger.totalConservativelyReserved).toBe(50)
    expect(ledger.reservations).toHaveLength(1)
  })
  it('honors an already exhausted daily shared ledger without asking YouTube or TMDB',async()=>{
    const b=await seededBucket(),s=services()
    await reserveWithAtomicGcs(b,{
      now:NOW,runId:610200,calls:50,preflight:preflight(),
    })
    const summary=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:preflight(),
      runId:610201,now:()=>NOW,...s,
    })
    expect(summary).toMatchObject({
      status:'daily-budget-exhausted',
      priorReserved:50,selectedForSearch:0,searchCalls:0,
    })
    expect(s.tmdbGet).not.toHaveBeenCalled()
    expect(s.youtubeApi).not.toHaveBeenCalled()
  })
  it('keeps spent reservations and started cursor on Google 429 with NO retry',async()=>{
    const b=await seededBucket(),s=services()
    s.youtubeApi.mockRejectedValue(Error('HTTP 429 RATE_LIMITED'))
    await expect(runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:preflight(),
      runId:610300,now:()=>NOW,wait:async()=>{},...s,
    })).rejects.toThrow('HTTP 429 RATE_LIMITED')
    expect(s.youtubeApi).toHaveBeenCalledTimes(1)
    const cursor=(await loadNightlyQueue(b)).queue
    expect(cursor.entries.find(e=>e.tmdbId===102)).toMatchObject({
      state:'started',runId:610300,
    })
    const second=await loadNightlyQueue(b)
    expect(second.queue.entries.some(e=>e.tmdbId===103&&e.state==='no-current-offer'))
      .toBe(true)
    const reserve=JSON.parse([...b.objects].find(([path])=>
      path.includes('private-search-budget'))[1].bytes.toString('utf8'))
    expect(reserve.totalConservativelyReserved).toBe(2)
    expect(reserve.reservations).toHaveLength(1)
  })
  it('fails closed before all external calls on stale monitoring, source or GCS bucket',async()=>{
    const b=await seededBucket(),s=services(),p=preflight()
    p.rate.units=90
    await expect(runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:p,
      runId:610400,now:()=>NOW,...s,
    })).rejects.toThrow('YOUTUBE_RESEARCH_SEARCH_PREFLIGHT_NOT_TRUSTED')
    await expect(runNightlyDiscovery({
      publicIndex:{...publicIndex(),source:'fallback'},bucket:b,
      preflight:preflight(),runId:610401,now:()=>NOW,...s,
    })).rejects.toThrow('G2_NIGHTLY_PUBLIC_INDEX_NOT_TRUSTED')
    expect(s.youtubeApi).not.toHaveBeenCalled()
    expect(s.tmdbGet).not.toHaveBeenCalled()
  })

  it('schedules away from the PT reset and only allows an explicit one-time main push',()=>{
    const workflow=readFileSync(new URL('../.github/workflows/youtube-g2-nightly-discovery.yml',
      import.meta.url),'utf8')
    expect(workflow).not.toContain('  schedule:')
    expect(workflow).toContain('  workflow_call:')
    expect(workflow).toContain('github.ref == \'refs/heads/main\'')
    expect(workflow).toContain("branches: [main]")
    expect(workflow).toContain("github.event_name == 'push'")
    expect(workflow).toContain("contains(github.event.head_commit.message, '[youtube-nightly-once]')")
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain("cancel-in-progress: false")
  })
  it('uses the same normal/degraded admission at live entrypoint and pure runner',()=>{
    const missing=evaluatePacificSearchBudget({
      now:NOW,rateHttp:200,rateResponse:{},
      exceededHttp:200,exceededResponse:{},
    })
    expect(validateNightlyDiscoveryPreflight(missing,{now:NOW})).toMatchObject({
      degradedOneSearch:true,
      day:{date:'2026-10-25'},
    })
    expect(validateNightlyDiscoveryPreflight(preflight(),{now:NOW})).toMatchObject({
      degradedOneSearch:false,
      day:{date:'2026-10-25'},
    })
    const early='2026-10-25T07:12:00Z'
    const invalid=evaluatePacificSearchBudget({
      now:early,rateHttp:200,rateResponse:{},
      exceededHttp:200,exceededResponse:{},
    })
    expect(()=>validateNightlyDiscoveryPreflight(invalid,{now:early}))
      .toThrow('YOUTUBE_RESEARCH_SEARCH_PREFLIGHT_NOT_TRUSTED')
    const source=readFileSync(new URL('../scripts/youtube-g2-nightly-discovery-live.mjs',
      import.meta.url),'utf8')
    expect(source).toContain('validateNightlyDiscoveryPreflight(preflight,{now:new Date().toISOString()})')
    expect(source).not.toContain('verifyBudgetPreflight(preflight,{now:new Date().toISOString()})')
  })
  it('advances exactly ONE uncached TMDB-badged film when both 200 Monitoring replies omit samples',async()=>{
    const p=evaluatePacificSearchBudget({
      now:NOW,rateHttp:200,rateResponse:{},
      exceededHttp:200,exceededResponse:{},
    })
    expect(p.smallBatchAdvisory).toBe(false)
    expect(p.blocks).toEqual([
      'metrics-inaccessible-or-paginated',
      'no-observed-usage-is-not-zero',
      'monitoring-samples-not-recent',
    ])
    expect(isDegradedOneSearchPreflight(p,{now:NOW})).toBe(true)
    const b=await seededBucket(),servicesA=services()
    const summary=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:p,
      runId:610501,now:()=>NOW,wait:async()=>{},...servicesA,
    })
    expect(summary).toMatchObject({
      quotaMode:'one-call-unmeasured-no-quota-guarantee',
      status:'completed',selectedForSearch:1,searchCalls:1,
      independentlyVerifiedDEOffers:0,publicationPermitted:false,
      firestoreWrites:0,providerWrites:0,badgeWrites:0,
    })
    expect(servicesA.youtubeApi.mock.calls.map(x=>x[0])).toEqual(['search'])
    const ledger=JSON.parse([...b.objects].find(([name])=>
      name.includes('private-search-budget'))[1].bytes.toString('utf8'))
    expect(ledger.totalConservativelyReserved).toBe(1)
    expect(ledger.externalCallersCoordinated).toBe(false)
    expect(ledger.remainingSharedProjectCalls).toBe(null)
    const servicesB=services()
    const next=await runNightlyDiscovery({
      publicIndex:publicIndex(),bucket:b,preflight:p,
      runId:610502,now:()=>NOW,...servicesB,
    })
    expect(next).toMatchObject({
      quotaMode:'one-call-unmeasured-no-quota-guarantee',
      status:'daily-budget-exhausted',selectedForSearch:0,searchCalls:0,
    })
    expect(servicesB.youtubeApi).not.toHaveBeenCalled()
    expect(servicesB.tmdbGet).not.toHaveBeenCalled()
  })
  it('never grants a degraded search too early, after HTTP failures or if a sample is present',async()=>{
    const early='2026-10-25T07:12:00.000Z'
    const candidates=[
      {now:early,rateHttp:200,rateResponse:{},
        exceededHttp:200,exceededResponse:{}},
      {now:NOW,rateHttp:403,rateResponse:{},
        exceededHttp:200,exceededResponse:{}},
      {now:NOW,rateHttp:200,rateResponse:{timeSeries:[]},
        exceededHttp:200,exceededResponse:{}},
    ]
    const b=await seededBucket(),s=services()
    for(const candidate of candidates){
      const p=evaluatePacificSearchBudget(candidate)
      expect(isDegradedOneSearchPreflight(p,{now:candidate.now})).toBe(false)
      await expect(runNightlyDiscovery({
        publicIndex:publicIndex(),bucket:b,preflight:p,
        runId:610503,now:()=>candidate.now,...s,
      })).rejects.toThrow('YOUTUBE_RESEARCH_SEARCH_PREFLIGHT_NOT_TRUSTED')
    }
    expect(s.youtubeApi).not.toHaveBeenCalled()
    expect(s.tmdbGet).not.toHaveBeenCalled()
  })
  it('never allows two unmetered calls, even from a direct GCS reservation attempt',async()=>{
    const p=evaluatePacificSearchBudget({
      now:NOW,rateHttp:200,rateResponse:{},
      exceededHttp:200,exceededResponse:{},
    })
    const b=await seededBucket()
    await expect(reserveWithAtomicGcs(b,{
      now:NOW,runId:610510,calls:2,preflight:p,degradedOneSearch:true,
    })).rejects.toThrow('YOUTUBE_RESEARCH_RESERVATION_INPUT_INVALID')
    const one=await reserveWithAtomicGcs(b,{
      now:NOW,runId:610510,calls:1,preflight:p,degradedOneSearch:true,
    })
    expect(one).toMatchObject({
      reservationCalls:1,globalGoogleQuotaGuaranteed:false,
      currentRemainingProjectQuota:null,automaticallyCallYoutube:false,
    })
    await expect(reserveWithAtomicGcs(b,{
      now:NOW,runId:610511,calls:1,preflight:p,degradedOneSearch:true,
    })).rejects.toThrow('YOUTUBE_DEGRADED_SINGLE_SEARCH_DAILY_ALLOWANCE_USED')
    const ledgers=[...b.objects].filter(([name])=>name.includes('private-search-budget'))
    expect(ledgers).toHaveLength(1)
    expect(JSON.parse(ledgers[0][1].bytes.toString('utf8'))
      .totalConservativelyReserved).toBe(1)
  })

})
