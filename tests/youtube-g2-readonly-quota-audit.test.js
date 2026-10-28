import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  summarizeYoutubeQuotaMetadata,quotaAuditMarkdown,
  configuredSearchLimitReadback,
} from '../scripts/youtube-g2-readonly-quota-audit.mjs'
const stamp='2026-10-25T08:45:00.000Z'
const sample={
  serviceHttp:200,
  serviceResponse:{name:'projects/612913221205/services/youtube.googleapis.com',state:'ENABLED'},
  metricsHttp:200,
  metricsResponse:{metrics:[{
    metric:'youtube.googleapis.com/read_requests',
    displayName:'Test reads',
    consumerQuotaLimits:[{
      unit:'1/{project}/{minute}',
      quotaBuckets:[{defaultLimit:'100',effectiveLimit:'75',dimensions:{}}],
    }],
  }]},
  checkedAt:stamp,
}
describe('YouTube: Google Cloud read-only quota audit',()=>{
  it('only reports configured limits, not actual usage, key quota or ready-to-search',()=>{
    const d=summarizeYoutubeQuotaMetadata(sample)
    expect(d).toMatchObject({
      serviceState:'enabled',quotaMetadataState:'readable',
      metricCount:1,quotaChanges:0,newYouTubeApiCalls:0,
      currentUsage:null,actualSearchCallsRemaining:null,perKeyRateLimit:null,
      rateLimit429RootCause:'not-established',
      futureSearchAutomaticallyPermitted:false,
      firestoreWrites:0,publicationPermitted:false,
    })
    expect(d.limits).toEqual([{
      metric:'youtube.googleapis.com/read_requests',unit:'1/{project}/{minute}',
      effectiveLimit:'75',defaultLimit:'100',dimensioned:false,overridden:true,
    }])
    const report=quotaAuditMarkdown(d)
    expect(report).toContain('100')
    expect(report).toContain('75')
    expect(report).toContain('0 YouTube-API-Aufrufe')
    expect(report).toContain('nicht nachgewiesen')
  })
  it('reports only actual effective search limits, not general read quota or remaining quota',()=>{
    const sampleWithSearch=structuredClone(sample)
    sampleWithSearch.metricsResponse.metrics.push({
      metric:'youtube.googleapis.com/search_list',
      consumerQuotaLimits:[
        {unit:'1/{project}/{day}',quotaBuckets:[{
          defaultLimit:'100',effectiveLimit:'95',dimensions:{},
        }]},
        {unit:'1/{project}/{minute}',quotaBuckets:[{
          defaultLimit:'10',effectiveLimit:'3',dimensions:{key:'private'},
        }]},
      ],
    })
    const parsed=summarizeYoutubeQuotaMetadata(sampleWithSearch)
    const r=configuredSearchLimitReadback(parsed)
    expect(r).toMatchObject({
      kind:'moviehub-youtube-search-config-readonly-v1',
      configurationComplete:true,visibleSearchLimitBuckets:2,
      searchLimits:[
        {unit:'1/{project}/{day}',effectiveLimit:'95',
          defaultLimit:'100',overridden:true,dimensioned:false},
        {unit:'1/{project}/{minute}',effectiveLimit:'3',
          defaultLimit:'10',overridden:true,dimensioned:true},
      ],
      actualSearchCallsRemaining:null,actualPacificDayUsage:null,
      allExternalConsumersVerified:false,authorizedSearchCalls:0,
      quotaChanges:0,youtubeApiCalls:0,
      futureSearchAutomaticallyPermitted:false,publicationPermitted:false,
    })
    expect(JSON.stringify(r)).not.toContain('private')
    expect(JSON.stringify(r)).not.toContain('read_requests')
  })
  it('keeps incomplete Google quota metrics unknown with no guessed effective limit',()=>{
    for(const change of [
      x=>{x.metricsHttp=403;x.metricsResponse={error:{message:'private'}}},
      x=>{x.metricsResponse={metrics:[],nextPageToken:'secret'}},
      x=>{x.serviceHttp=404;x.serviceResponse=null},
    ]){
      const q=structuredClone(sample);change(q)
      const r=configuredSearchLimitReadback(summarizeYoutubeQuotaMetadata(q))
      expect(r).toMatchObject({
        configurationComplete:false,visibleSearchLimitBuckets:0,
        searchLimits:[],actualPacificDayUsage:null,
        allExternalConsumersVerified:false,authorizedSearchCalls:0,
      })
      expect(JSON.stringify(r)).not.toContain('secret')
    }
  })
  it('will not turn a mutated or self-approved quota report into trusted config',()=>{
    const q=summarizeYoutubeQuotaMetadata(sample)
    q.futureSearchAutomaticallyPermitted=true
    expect(()=>configuredSearchLimitReadback(q)).toThrow('YOUTUBE_SEARCH_CONFIG_READBACK_UNTRUSTED')
    const p=summarizeYoutubeQuotaMetadata(sample)
    p.limits.push({metric:'youtube.googleapis.com/search_list',
      unit:'1/{project}/{day}',effectiveLimit:'100',
      defaultLimit:'100',dimensioned:false,overridden:true})
    expect(()=>configuredSearchLimitReadback(p)).toThrow('YOUTUBE_SEARCH_CONFIG_LIMIT_INVALID')
  })
  it('keeps OIDC quota config workflow gated to one explicit main push only',()=>{
    const wf=readFileSync(new URL(
      '../.github/workflows/youtube-g2-quota-readonly-audit.yml',import.meta.url),'utf8')
    expect(wf).toContain('[youtube-quota-readonly-once]')
    expect(wf).toContain('CONFIGURED_SEARCH_LIMITS_READONLY')
    expect(wf).toContain('search.futureSearchAutomaticallyPermitted!==false')
    expect(wf).not.toContain('youtube-g2-nightly-discovery-live.mjs')
  })
  it('treats insufficient IAM or disabled API as unknown, NOT zero usage',()=>{
    for(const status of [403,404,429]){
      const d=summarizeYoutubeQuotaMetadata({
        checkedAt:stamp,serviceHttp:status,metricsHttp:status,
        serviceResponse:{error:{message:'possible secret, never output'}},
        metricsResponse:{error:{message:'hidden project data'}},
      })
      expect(d.serviceState).toBe('not-readable')
      expect(d.quotaMetadataState).toBe('not-readable')
      expect(d.limits).toEqual([])
      expect(d.actualSearchCallsRemaining).toBe(null)
      expect(JSON.stringify(d)).not.toContain('possible secret')
      expect(JSON.stringify(d)).not.toContain('hidden project data')
    }
  })
  it('does not claim full coverage for paginated or metrics-absent response',()=>{
    const p=summarizeYoutubeQuotaMetadata({
      ...sample,metricsResponse:{...sample.metricsResponse,nextPageToken:'secret-token'},
    })
    expect(p.quotaMetadataState).toBe('incomplete-pagination')
    expect(JSON.stringify(p)).not.toContain('secret-token')
    const q=summarizeYoutubeQuotaMetadata({
      ...sample,metricsResponse:{},serviceResponse:{state:'ENABLED'},
    })
    expect(q.quotaMetadataState).toBe('missing-metrics')
  })
  it('fails closed on forged service identity, foreign metrics, bad limits or approval',()=>{
    const mutations=[
      p=>{p.serviceResponse.name='projects/other/services/youtube.googleapis.com'},
      p=>{p.metricsResponse.metrics[0].metric='drive.googleapis.com/read'},
      p=>{p.metricsResponse.metrics[0].consumerQuotaLimits[0].quotaBuckets[0].effectiveLimit='not a number'},
      p=>{p.metricsResponse.metrics[0].consumerQuotaLimits[0].unit={unit:'unsafe'}},
      p=>{p.metricsResponse.metrics=undefined},
      p=>{p.metricsResponse.metrics[0].consumerQuotaLimits=null},
      p=>{p.serviceHttp=201},
    ]
    for(const mutate of mutations){
      const p=structuredClone(sample);mutate(p)
      if(p.metricsResponse.metrics===undefined){
        expect(summarizeYoutubeQuotaMetadata(p).quotaMetadataState).toBe('missing-metrics')
      }else{
        expect(()=>summarizeYoutubeQuotaMetadata(p)).toThrow()
      }
    }
    const forged=summarizeYoutubeQuotaMetadata(sample)
    forged.futureSearchAutomaticallyPermitted=true
    expect(()=>quotaAuditMarkdown(forged)).toThrow()
  })
})
