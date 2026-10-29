import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  runDiagnostic,apiProbe,interpretDiagnostic,sanitizeProbe,readQuotaLimits,
  diagnosticMarkdown,DIAG_INTERVAL_MINUTES,DIAG_SEARCH_PARAMS,
} from '../scripts/youtube-g2-search-api-diagnostic.mjs'

const START=Date.parse('2026-10-29T15:00:00.000Z')
const clock=()=>{let t=START;const waits=[];return {
  nowMs:()=>t,wait:async ms=>{t+=ms;waits.push(ms)},waits,
}}
describe('isolated bounded read-only YouTube quota diagnostics',()=>{
  it('performs only one search and one videos.list per twenty-minute round',async()=>{
    const c=clock(),calls=[],snapshots=[]
    const r=await runDiagnostic({
      durationMinutes:60,nowMs:c.nowMs,wait:c.wait,
      quotaRead:async()=>({status:'api-not-readable',httpStatus:403}),
      apiCall:async(endpoint,params)=>{
        calls.push({endpoint,params})
        return endpoint==='videos'
          ?{ok:true,items:1}
          :{status:429,reason:'RATE_LIMITED'}
      },
      onProgress:async v=>snapshots.push(v),
    })
    expect(r).toMatchObject({
      searchAttempts:4,successfulSearch:0,rateLimitResponses:4,
      videoListAttempts:4,successfulVideoList:4,
      observation:'search-only-failing-while-videos-works',
    })
    expect(c.waits).toEqual([1200000,1200000,1200000])
    expect(calls.map(x=>x.endpoint)).toEqual([
      'videos','search','videos','search','videos','search','videos','search'])
    expect(calls.filter(x=>x.endpoint==='search').map(x=>x.params.videoType))
      .toEqual(['movie',undefined,'movie',undefined])
    expect(snapshots).toHaveLength(4)
    expect(DIAG_INTERVAL_MINUTES).toBe(20)
    expect(DIAG_SEARCH_PARAMS).toHaveLength(2)
    expect(JSON.stringify(r)).not.toContain('Der Pate')
    expect(diagnosticMarkdown(r)).not.toContain('Der Pate')
  })
  it('retries spaced 429 responses and recognizes real recovery',async()=>{
    const c=clock();let queries=0
    const r=await runDiagnostic({
      durationMinutes:60,nowMs:c.nowMs,wait:c.wait,
      quotaRead:async()=>({status:'readable',matchingSearchMetrics:1,
        effectiveSearchLimits:[100]}),
      apiCall:async endpoint=>endpoint==='videos'?{ok:true,items:1}:
        ++queries>2?{ok:true,items:10}:{status:429,reason:'RATE_LIMITED'},
    })
    expect(r).toMatchObject({
      successfulSearch:2,rateLimitResponses:2,searchAttempts:4,
      observation:'search-worked-at-least-once',
    })
    expect(r.quota.effectiveSearchLimits).toEqual([100])
    expect(r.samples[0].pacificDay).toBe('2026-10-29')
  })
  it('stops on a definitely exhausted Google quota, never calls production APIs',async()=>{
    const c=clock(),endpoints=[]
    const r=await runDiagnostic({
      durationMinutes:240,nowMs:c.nowMs,wait:c.wait,
      quotaRead:async()=>({status:'api-not-readable'}),
      apiCall:async e=>{endpoints.push(e);return e==='videos'
        ?{ok:true,items:1}:{status:403,reason:'QUOTA_EXHAUSTED'}},
    })
    expect(r).toMatchObject({
      searchAttempts:1,explicitQuotaResponses:1,
      observation:'google-confirmed-search-quota-exhausted',
    })
    expect(endpoints).toEqual(['videos','search'])
    expect(c.waits).toEqual([])
  })
  it('exports only allowlisted API status, never raw response, secrets or arbitrary errors',async()=>{
    const secret='DONT_EXPOSE_THIS_API_KEY',privateText='RAW_GOOGLE_BODY_PRIVATE'
    const result=await apiProbe('search',{q:'private'},secret,{get:async()=>{
      const e=Error(privateText)
      e.youtubeHttpStatus=429
      e.youtubeFailureClass='RATE_LIMITED'
      e.retryAfterMs=120000
      throw e
    }})
    expect(result).toEqual({status:429,reason:'RATE_LIMITED',items:null,
      retryAfterMs:120000})
    expect(sanitizeProbe({status:429,reason:'unexpected-'+privateText}))
      .toMatchObject({reason:'UNKNOWN_ERROR'})
    expect(JSON.stringify(result)).not.toMatch(/DONT_EXPOSE|RAW_GOOGLE|private/)
  })
  it('reads quota configuration safely and separately from quota usage',async()=>{
    const result=await readQuotaLimits({
      getToken:async()=> 'a-valid-fake-token-string',
      fetchImpl:async()=>({ok:true,
        json:async()=>({metrics:[{
          metric:'youtube.googleapis.com/search_queries',
          displayName:'Search Queries per day',
          consumerQuotaLimits:[{quotaBuckets:[{effectiveLimit:'100'}]}],
        },{
          metric:'youtube.googleapis.com/other',
          consumerQuotaLimits:[{quotaBuckets:[{effectiveLimit:'10000'}]}],
        }]})}),
    })
    expect(result).toEqual({
      status:'readable',matchingSearchMetrics:1,effectiveSearchLimits:[100]})
    expect(JSON.stringify(result)).not.toMatch(/secret|usage|remaining/)
  })
  it('workflow is manual-only and production-independent',()=>{
    const workflow=readFileSync(new URL(
      '../.github/workflows/youtube-g2-search-api-diagnostic.yml',import.meta.url),'utf8')
    expect(workflow).toContain('  workflow_dispatch:')
    expect(workflow).not.toMatch(/^  schedule:/m)
    expect(workflow).not.toMatch(/^  push:/m)
    expect(workflow).not.toContain('workflow_call:')
    expect(workflow).toContain('timeout-minutes: 270')
    expect(workflow).toContain('id-token: write')
    expect(workflow).not.toContain('firebase deploy')
    expect(workflow).not.toContain('TMDB_API_READ_TOKEN')
    expect(workflow).not.toContain('DATA_CHECKPOINT_BUCKET')
  })
})
