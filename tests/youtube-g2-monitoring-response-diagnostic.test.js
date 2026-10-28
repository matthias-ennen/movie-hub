import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  summarizeResponse,analyzeSampling,compareSamples,diagnosticMarkdown,
  runReadOnlyMonitoringDiagnosis,
} from '../scripts/youtube-g2-monitoring-response-diagnostic.mjs'
import {RATE,EXCEEDED,QUOTA}
  from '../scripts/youtube-g2-pacific-search-preflight.mjs'

const now='2026-10-28T18:00:00.000Z'
const point=(time,value)=>({interval:{
  startTime:new Date(Date.parse(time)-60000).toISOString(),
  endTime:time,
},value:{int64Value:String(value)}})
const rate=(value=5,time='2026-10-28T17:49:00.000Z')=>({
  timeSeries:[{
    metric:{type:RATE,labels:{quota_metric:QUOTA}},
    resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
    points:[point(time,value)],
  }],
})
const exceeded=()=>({timeSeries:[]})
const sample=(round,at,body=rate(),http=200)=>analyzeSampling({
  at,round,rateHttp:http,rateBody:body,
  exceededHttp:200,exceededBody:exceeded(),
})

describe('isolate Google Monitoring 3x without YouTube API search (#388)',()=>{
  it('classifies fresh complete quota metrics with no Google remaining-usage assertion',()=>{
    const s=sample(1,now)
    expect(s).toMatchObject({
      round:1,parseStatus:'validated',rate:{httpStatus:200,
        shape:'present-timeseries',seriesCount:1,pointCount:1,
        newestPointUTC:'2026-10-28T17:49:00.000Z'},
      exceeded:{httpStatus:200,shape:'empty-timeseries',
        seriesCount:0,pointCount:0},
      preflight:{advisory:true,observedSearchUnits:5,ageMinutes:11,
        proposedAdapterResearchCap:50,observedGoogleRemaining:null},
      youtubeSearchCalls:0,quotaMutations:0,
    })
    expect(s.googleRemainingQuotaGuaranteed).toBe(false)
  })
  it('treats HTTP 200 missing timeSeries as NOT a reliable zero-usage value',()=>{
    const x=sample(1,now,{})
    expect(x.rate.shape).toBe('missing-timeseries')
    expect(x.parseStatus).toBe('validated')
    expect(x.preflight).toMatchObject({advisory:false,observedSearchUnits:0})
    expect(x.preflight.blocks).toContain('no-observed-usage-is-not-zero')
    expect(x.preflight.blocks).toContain('metrics-inaccessible-or-paginated')
  })
  it('classifies stale, expired, forged and over-limit observations without authentication data',()=>{
    expect(sample(1,now,rate(5,'2026-10-28T17:30:00.000Z'))
      .preflight.blocks).toContain('monitoring-samples-not-recent')
    expect(sample(1,now,rate(11)).preflight.blocks)
      .toContain('outside-conservative-50-call-headroom')
    expect(sample(1,now,rate(5),403).preflight?.advisory).toBe(false)
    expect(summarizeResponse(200,{timeSeries:[],nextPageToken:'SECRET_PAGINATION'},RATE)
      .shape).toBe('paginated-timeseries')
    const wrong=rate()
    wrong.timeSeries[0].metric.labels.quota_metric='SECRET_FOREIGN_METRIC'
    const r=sample(1,now,wrong)
    expect(r.parseStatus).toBe('invalid-metric-or-series')
    expect(JSON.stringify(r)).not.toContain('SECRET_FOREIGN_METRIC')
    expect(JSON.stringify(r)).not.toContain('SECRET_PAGINATION')
  })
  it('diffs worsening and improving response shapes, ages, freshness and quota admission',()=>{
    const samples=[
      sample(1,now,{}),
      sample(2,'2026-10-28T18:02:00.000Z',rate(5)),
      sample(3,'2026-10-28T18:05:00.000Z',
        rate(7,'2026-10-28T18:04:00.000Z')),
    ]
    const r=compareSamples(samples)
    expect(r).toMatchObject({
      anyAdmissionAdvisory:true,allAdmissionAdvisories:false,
      youtubeSearchCalls:0,wouldAuthorizeGoogleSearch:false,
    })
    expect(r.differences[0].changedFields).toContain('rate.shape')
    expect(r.differences[1].changedFields).toContain('rate.newestPointUTC')
    expect(r.differences[1].changedFields).toContain('preflight.observedSearchUnits')
    const report=diagnosticMarkdown(r)
    expect(report).toContain('Probe')
    expect(report).toContain('missing-timeseries')
    expect(report).toContain('present-timeseries')
    expect(report).not.toContain('Bearer')
  })
  it('reads ONLY monitoring.googleapis.com six times, at three injected timestamps',async()=>{
    const seen=[],times=[
      now,'2026-10-28T18:02:00.000Z','2026-10-28T18:05:00.000Z',
    ]
    const fetchImpl=vi.fn(async(url,opts)=>{
      seen.push({url,headers:opts.headers})
      const isRate=url.includes('quota%2Frate%2Fnet_usage')
      const body=isRate?rate():exceeded()
      return {status:200,headers:{get:()=>null},
        text:async()=>JSON.stringify(body)}
    })
    const waits=[]
    let idx=0
    const r=await runReadOnlyMonitoringDiagnosis({
      fetchImpl,
      getToken:async()=> 'FIXTURE_TOKEN_NEVER_PUBLISH',
      now:()=>times[idx++],sleep:async ms=>waits.push(ms),
      pauses:[120000,180000],writeArtifacts:false,
    })
    expect(waits).toEqual([120000,180000])
    expect(fetchImpl).toHaveBeenCalledTimes(6)
    expect(seen.every(x=>new URL(x.url).hostname==='monitoring.googleapis.com'))
      .toBe(true)
    expect(seen.every(x=>new URL(x.url).pathname.endsWith(
      '/projects/movie-hub-62459/timeSeries'))).toBe(true)
    const printed=JSON.stringify(r)
    expect(printed).not.toContain('FIXTURE_TOKEN_NEVER_PUBLISH')
    expect(r.samples).toHaveLength(3)
    expect(r.youtubeSearchCalls).toBe(0)
  })
  it('keeps any production data/YouTube write out of the scheduled and push-only workflow',()=>{
    const yml=readFileSync(new URL(
      '../.github/workflows/youtube-g2-monitoring-response-diagnostic.yml',
      import.meta.url),'utf8')
    expect(yml).toContain('workflow_dispatch:')
    expect(yml).toContain('2026-10-29')
    expect(yml).toContain('[youtube-monitoring-diagnostic-once]')
    expect(yml).toContain('timeout-minutes: 20')
    expect(yml).toContain('google-github-actions/auth@v3')
    expect(yml).toContain('retention-days: 14')
    expect(yml).not.toContain('contents: write')
    expect(yml).not.toContain('secrets.YOUTUBE_API_KEY')
    expect(yml).not.toContain('scripts/youtube-g2-nightly-discovery-live.mjs')
    expect(yml).not.toContain('deploy-firebase.yml')
    const src=readFileSync(new URL(
      '../scripts/youtube-g2-monitoring-response-diagnostic.mjs',
      import.meta.url),'utf8')
    expect(src).toContain('monitoring.googleapis.com')
    expect(src).not.toContain('www.googleapis.com/youtube')
    expect(src).not.toContain('search.list')
    expect(src).not.toContain('secrets.')
  })
})
