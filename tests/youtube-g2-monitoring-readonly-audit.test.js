import {describe,it,expect} from 'vitest'
import {
  summarizeYoutubeSearchMonitoring,searchMonitoringMarkdown,
} from '../scripts/youtube-g2-monitoring-readonly-audit.mjs'
const from='2026-10-23T09:00:00.000Z',to='2026-10-25T09:00:00.000Z'
const rateSeries={
  metric:{type:'serviceruntime.googleapis.com/quota/rate/net_usage',
    labels:{quota_metric:'youtube.googleapis.com/search_list',method:'search.list'}},
  resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
  points:[{
    interval:{startTime:'2026-10-24T16:00:00.000Z',endTime:'2026-10-24T16:01:00.000Z'},
    value:{int64Value:'2'},
  }],
}
const exceededSeries={
  metric:{type:'serviceruntime.googleapis.com/quota/exceeded',
    labels:{quota_metric:'youtube.googleapis.com/search_list'}},
  resource:{type:'consumer_quota',labels:{service:'youtube.googleapis.com'}},
  points:[{
    interval:{startTime:'2026-10-24T16:01:00.000Z',endTime:'2026-10-24T16:01:00.000Z'},
    value:{boolValue:true},
  }],
}
function sample(){
  return {from,to,rateHttp:200,exceededHttp:200,
    rateResponse:{timeSeries:[structuredClone(rateSeries)]},
    exceededResponse:{timeSeries:[structuredClone(exceededSeries)]}}
}
describe('Cloud Monitoring YouTube search only, read-only',()=>{
  it('counts observed deltas and quota-exceeded samples without asserting root cause',()=>{
    const audit=summarizeYoutubeSearchMonitoring(sample())
    expect(audit.rate).toMatchObject({
      http:200,availability:'has-reported-series',series:1,
      observedPoints:1,observedDeltaSum:'2',
    })
    expect(audit.exceeded).toMatchObject({
      http:200,availability:'has-reported-series',series:1,
      trueExceededSamples:1,
    })
    expect(audit).toMatchObject({
      actualRemainingSearchCalls:null,exact429Cause:'not-established',
      proofOfZeroUsage:false,searchAutomaticallyAllowed:false,
      youtubeApiRequests:0,quotaChanges:0,monitoringChanges:0,
      firestoreWrites:0,privateArtifact:true,publicationPermitted:false,
    })
    expect(searchMonitoringMarkdown(audit)).toContain('kein')
  })
  it('reports unavailable and empty time-series as unknown, never as zero API usage',()=>{
    for(const http of [403,404,429]){
      const audit=summarizeYoutubeSearchMonitoring({
        from,to,rateHttp:http,exceededHttp:http,
        rateResponse:{error:{message:'do not expose'}},
        exceededResponse:{error:{message:'secret'}},
      })
      expect(audit.rate.availability).toBe('not-readable')
      expect(audit.exceeded.availability).toBe('not-readable')
      expect(audit.proofOfZeroUsage).toBe(false)
      expect(JSON.stringify(audit)).not.toContain('secret')
    }
    const missing=summarizeYoutubeSearchMonitoring({
      from,to,rateHttp:200,rateResponse:{timeSeries:[]},
      exceededHttp:200,exceededResponse:{timeSeries:[]},
    })
    expect(missing.rate.availability).toBe('no-reported-series')
    expect(missing.proofOfZeroUsage).toBe(false)
  })
  it('refuses wrong service, quota, values, timestamps and forged auto-search',()=>{
    const edits=[
      x=>{x.rateResponse.timeSeries[0].resource.labels.service='drive.googleapis.com'},
      x=>{x.rateResponse.timeSeries[0].metric.labels.quota_metric='not-youtube'},
      x=>{x.rateResponse.timeSeries[0].metric.type='other.googleapis.com/thing'},
      x=>{x.rateResponse.timeSeries[0].points[0].value.int64Value='-1'},
      x=>{x.rateResponse.timeSeries[0].points[0].interval.endTime='2027-01-01T00:00:00Z'},
      x=>{x.exceededResponse.timeSeries[0].points[0].value.boolValue=1},
      x=>{x.rateResponse.timeSeries={not:'list'}},
    ]
    for(const edit of edits){
      const input=sample();edit(input)
      expect(()=>summarizeYoutubeSearchMonitoring(input)).toThrow()
    }
    const auth=summarizeYoutubeSearchMonitoring(sample())
    auth.searchAutomaticallyAllowed=true
    expect(()=>searchMonitoringMarkdown(auth)).toThrow()
  })
  it('marks partial pagination as not exhaustive',()=>{
    const input=sample()
    input.rateResponse.nextPageToken='secret-pagination-token'
    const audit=summarizeYoutubeSearchMonitoring(input)
    expect(audit.rate.availability).toBe('partial-page')
    expect(JSON.stringify(audit)).not.toContain('secret-pagination-token')
  })
})
