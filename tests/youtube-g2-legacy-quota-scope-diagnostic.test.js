import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  SEARCH_QUOTA,LEGACY_METRICS,inspectLegacySeries,
  compareLegacyQuotaSeries,
} from '../scripts/youtube-g2-legacy-quota-scope-diagnostic.mjs'

function observed(metric,{quota=SEARCH_QUOTA,value,at='2026-10-27T06:37:00Z'}={}){
  return {metric:{type:metric,labels:{quota_metric:quota}},
    resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
    points:[{interval:{startTime:'2026-10-27T06:36:00Z',endTime:at},
      value:value??(metric===LEGACY_METRICS.rate
        ?{int64Value:'13'}:{boolValue:false})}]}
}
const sample={
  rateHttp:200,rateDoc:{timeSeries:[observed(LEGACY_METRICS.rate)]},
  rateScopeHttp:200,rateScopeDoc:{timeSeries:[observed(LEGACY_METRICS.rate),
    observed(LEGACY_METRICS.rate,{quota:'youtube.googleapis.com/other'})]},
  exceededHttp:200,exceededDoc:{},
  exceededScopeHttp:200,exceededScopeDoc:{},
}
describe('Legacy YouTube quota monitoring read-only diagnostic',()=>{
  it('distinguishes real rate samples from omitted exceeded samples',()=>{
    const x=compareLegacyQuotaSeries(sample)
    expect(x).toMatchObject({
      rate:{http:200,shape:'timeSeries-present',series:1,targetSeries:1,points:1,
        latestSample:'2026-10-27T06:37:00.000Z'},
      rateScope:{http:200,shape:'timeSeries-present',series:2,targetSeries:1,points:2},
      exceeded:{http:200,shape:'timeSeries-omitted',series:null,targetSeries:null},
      exceededScope:{http:200,shape:'timeSeries-omitted'},
      anyTargetRateObserved:true,anyTargetExceededObserved:false,
      rateFilterMayHideTarget:false,exceededFilterMayHideTarget:false,
      currentRemainingQuota:null,measuredActualSearchCalls:null,
      authorizedSearchCalls:0,youtubeApiCalls:0,gcsWrites:0,
      publicationPermitted:false,quotaWrites:0,
    })
  })
  it('recognizes a target metric present only after dropping the quota label filter',()=>{
    const x=compareLegacyQuotaSeries({...sample,
      rateDoc:{timeSeries:[]},
      exceededDoc:{timeSeries:[]},
      exceededScopeDoc:{timeSeries:[observed(LEGACY_METRICS.exceeded)]},
    })
    expect(x.rateFilterMayHideTarget).toBe(true)
    expect(x.exceededFilterMayHideTarget).toBe(true)
    expect(x.authorizedSearchCalls).toBe(0)
  })
  it('never turns an absent timeSeries field into observed zero',()=>{
    const r=inspectLegacySeries({
      http:200,document:{},metric:LEGACY_METRICS.rate,
    })
    expect(r).toMatchObject({
      shape:'timeSeries-omitted',series:null,points:null,targetSeries:null,
    })
    const empty=inspectLegacySeries({
      http:200,document:{timeSeries:[]},metric:LEGACY_METRICS.rate,
    })
    expect(empty).toMatchObject({
      shape:'timeSeries-empty',series:0,targetSeries:0,points:0,
    })
  })
  it('marks pagination and HTTP failure as unknown, without copying response data',()=>{
    const response={timeSeries:[observed(LEGACY_METRICS.rate)],
      nextPageToken:'private-token'}
    const r=inspectLegacySeries({
      http:200,document:response,metric:LEGACY_METRICS.rate,
    })
    expect(r).toMatchObject({shape:'paginated-unknown',series:null,points:null,
      hasMorePages:true})
    expect(JSON.stringify(r)).not.toContain('private-token')
    const failed=inspectLegacySeries({
      http:403,document:{error:{message:'private-secret'}},
      metric:LEGACY_METRICS.rate,
    })
    expect(failed).toMatchObject({shape:'http-unavailable',series:null,http:403})
    expect(JSON.stringify(failed)).not.toContain('private-secret')
  })
  it('rejects foreign service/metric and suspicious narrow quota values',()=>{
    for(const modify of [
      x=>{x.metric.type='other.googleapis.com/quota/rate/net_usage'},
      x=>{x.resource.labels.service='other.googleapis.com'},
      x=>{x.metric.labels.quota_metric='youtube.googleapis.com/something-else'},
      x=>{x.points[0].value={int64Value:'private-secret'}},
    ]){
      const x=observed(LEGACY_METRICS.rate)
      modify(x)
      const r=inspectLegacySeries({
        http:200,document:{timeSeries:[x]},metric:LEGACY_METRICS.rate})
      expect(['unexpected-series','foreign-quota-in-narrow-query','invalid-point'])
        .toContain(r.shape)
      expect(r.targetSeries).toBeNull()
      expect(JSON.stringify(r)).not.toContain('private-secret')
    }
  })
  it('retains original fail-closed preflight and keeps scope checks read-only',()=>{
    const existing=readFileSync(new URL(
      '../scripts/youtube-g2-pacific-search-preflight.mjs',import.meta.url),'utf8')
    const workflow=readFileSync(new URL(
      '../.github/workflows/youtube-g2-pacific-search-preflight.yml',
      import.meta.url),'utf8')
    expect(existing).toContain("if(!rate.complete||!exceeded.complete)blocks.push('metrics-inaccessible-or-paginated')")
    expect(existing).toContain('authorizedSearchCalls:0,automaticSearchAllowed:false')
    expect(workflow).toContain("for type in rate exceeded ratev2 ratev2scope ratescope exceededscope; do")
    expect(workflow).toContain('scripts/youtube-g2-legacy-quota-scope-diagnostic.mjs')
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'")
    expect(workflow).toContain('0 search requests, 0 quota changes')
    expect(workflow).not.toContain('youtube-g2-nightly-discovery-live.mjs')
  })
})
